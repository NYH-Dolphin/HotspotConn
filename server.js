const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const wifi = require('node-wifi');
const cmd = require('./cmd');
const utils = require('./utils');
const { Mutex } = require('async-mutex');
const os = require('os');
const fsp = require('fs').promises;

const app = express();
app.use(express.json()); // 使用 express.json() 解析JSON请求体
const port = 3000;
const closeHotspotTime = 5; // 几分钟后关闭热点
const FILE_FOLDER = path.join(process.env.APPDATA || '', 'wenyinyi_web_electron', 'Device');
const HOTSPOT_CONFIG = 'hotspot.json';
var connect = false; // 是否连接上了热点
const mutex = new Mutex(); // post 请求全局锁：只允许一个人连接

// 开启服务器
async function startServer() {
    // 检查以太网是否已经连接: 如果已经连接将直接关闭热点
    if (await cmd.isEthernetConnected()) {
        try {
            await cmd.stopHotspot();  // 关闭热点
        } catch (err) {
            console.log("热点无法关闭，请检查服务器权限", err);
        } finally {
            return;
        }
    }

    // 检查保存文件路径是否存在，如果不存在，服务器执行初始化
    try {
        await fsp.access(FILE_FOLDER);
    } catch (err) {
        await fsp.mkdir(FILE_FOLDER, { recursive: true });
        let success = await initialization();
        if (!success) return;
    }

    try {
        // 开启热点
        await cmd.startHotspot();
    } catch (err) {
        console.log("热点无法打开，请检查服务器权限", err);
        return;
    }


    //  开启 wifi
    wifi.init({
        iface: null // network interface, if set to null will use default interface
    });

    // 启动服务器
    let server = app.listen(port, () => {
        console.log(`服务器正在运行，访问 http://localhost:${port}`);
    });


    // 测试
    app.get('/', async (req, res) => {
        return res.send('Server Start!');
    });


    // 获取周围 Wi-Fi 网络
    app.get('/scan', async (req, res) => {
        try {
            const networks = await wifi.scan();
            console.log(networks);
            res.json(networks);
        } catch (error) {
            console.error(error);
            res.status(500).send('扫描 Wi-Fi 网络失败');
        }
    });

    app.get('/online', async (req, res) => {
        if (connect) {
            res.status(200).json({ connection: true, message: '已连接 Wi-Fi' });
        } else {
            res.status(200).json({ connection: false, message: '未连接 Wi-Fi' });
        }
    });


    // 尝试连接网络
    app.post('/connect', async (req, res) => {
        // 检查是否能够获取锁
        const [release, isLocked] = await mutex.tryAcquire();

        // 如果已经锁住，立即返回提示
        if (isLocked) {
            return res.status(200).json({ execution: false, message: '不允许多个用户同时请求，当前请求被锁定' });
        }

        try {
            const ssid = req.body.ssid;
            const password = req.body.password;

            // 首先回复已经连接
            res.status(200).json({ execution: true, message: '已发送连接请求，正在处理中' });

            // ----------------------------------------------------------------------------
            // 检查已有的 profile
            const profiles = await cmd.checkExistedProfile();
            // 如果旧的 profile 已存在
            if (profiles.includes(ssid)) {
                await cmd.deleteProfile(ssid);
            }

            // 创建新的profile XML 文件
            await createProfileXML(ssid, password);

            // 尝试添加的profile到电脑
            let profilePath = `%appdata%\\wenyinyi_web_electron\\Device\\${ssid}Profile.xml`;
            await cmd.addToProfile(profilePath);

            // 尝试连接该 profile: 这段时间热点会闪断一下
            await cmd.connectToProfile(ssid);

            // 检查网络情况，确认是否已经连接 Wi-Fi
            let responseSent = false; // 用于标志是否已经发送响应

            // 持续五秒检测是否连接
            let checkInterval;
            checkInterval = setInterval(async () => {
                const isConnected = await new Promise((resolve) => checkConnection(resolve));
                if (isConnected) {
                    console.log(`成功连接到 Wi-Fi: ${ssid}`);
                    connect = true;
                    responseSent = true;
                    clearInterval(checkInterval);
                    setTimeout(async () => {
                        await cmd.stopHotspot();
                    }, closeHotspotTime * 60 * 1000);
                }
            }, 1 * 1000);

            // 超时设置：5秒后停止检测
            setTimeout(async () => {
                clearInterval(checkInterval); // 停止检测
                if (!responseSent) {
                    const isConnected = await new Promise((resolve) => checkConnection(resolve));
                    if (!isConnected) {
                        console.log('连接超时，可能是密码错误或其他问题');
                        await cmd.deleteProfile(ssid);
                        await deleteProfileXML(ssid);
                    } else {
                        console.log('连接成功');
                        setTimeout(async () => {
                            await cmd.stopHotspot();
                        }, closeHotspotTime * 60 * 1000);
                    }
                }
            }, 5 * 1000);

        } catch (error) {
            console.error(`处理连接时出错: ${error}`);
            // 如果之前未响应，返回500错误
            if (!res.headersSent) {
                res.status(500).json({ message: '服务器内部错误' });
            }
        } finally {
            release(); // 释放锁
        }
        return;
    });


    let ethernetConn = setInterval(async () => {
        const isConnected = await cmd.isEthernetConnected();  // 异步等待以太网连接状态
        // 连接上以太网后
        if (isConnected) {
            await cmd.stopHotspot();  // ，停止热点
            if (server) { // 关闭服务器
                server.close(() => { console.log("服务器已关闭"); })
            }
            clearInterval(ethernetConn);
        }
    }, 60 * 1000);  // 每分钟检查一次
}

// 仅服务器初始化的时候使用
async function initialization() {
    console.log("初始化配置服务器");
    let ssid = '';
    let password = '';

    var macAddress = await cmd.findMacAddress();
    if (macAddress) {
        ssid = `PRINTER_${macAddress.substring(0, 7).toUpperCase()}`;
        password = `wenyinyi:${macAddress.substring(0, 5)}`;
    } else {
        const interfaces = os.networkInterfaces();
        for (let interfaceName in interfaces) {
            const interfaceInfo = interfaces[interfaceName];
            if (!interfaceName.includes("WLAN")) {
                continue;
            }
            interfaceInfo.forEach(info => {
                if (info.mac && !info.internal) {
                    const macAddress = info.mac.replace(/:/g, ''); // 去掉冒号
                    ssid = `PRINTER_${macAddress.substring(0, 7).toUpperCase()}`;
                    password = `wenyinyi:${macAddress.substring(0, 5)}`;
                }
            });
        }
    }

    if (!ssid) {
        console.error("没有找到 MAC 地址，服务器初始化失败！");
        return false;
    }

    try {
        await cmd.createHotspot(ssid, password);
        // 加密热点信息
        const encryptedData = utils.encrypt(JSON.stringify({ ssid, password }));
        // 保存JSON
        try {
            await fsp.writeFile(path.join(FILE_FOLDER, HOTSPOT_CONFIG), JSON.stringify(encryptedData));
            console.log("热点信息已保存");
        } catch (err) {
            console.error("保存热点信息时出错", err);
        }

        // 生成二维码
        // const hotspotQRCodePath = path.join(__dirname, hotspotQRCodeName);
        // console.log(hotspotQRCodePath);
        // await utils.generateQRCode(hotspotQRCodePath, JSON.stringify(encryptedData));
        console.log(`热点名称：${ssid}, 密码：${password}，请记录`);
        console.log('服务器已初始化完成，请重新启动服务器');
        return true;
    } catch (error) {
        console.error('服务器初始化失败\n', error);
        return false;
    }
}


// 删除新的 Profile 的配置文件 XML
function deleteProfileXML(ssid) {
    const profilePath = path.join(FILE_FOLDER, `${ssid}Profile.xml`);
    console.log(profilePath);
    return fsp.unlink(profilePath)
        .then(() => { `${ssid} 的XML文件已经删除` });
}

// 创建新的 Profile 的配置文件 XML
async function createProfileXML(ssid, password) {
    console.log("创建新的配置文件");
    const profileXml = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>${ssid}</name>
    <SSIDConfig>
        <SSID>
            <hex>${Buffer.from(ssid).toString('hex')}</hex>
            <name>${ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>${password}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
    <MacRandomization xmlns="http://www.microsoft.com/networking/WLAN/profile/v3">
        <enableRandomization>false</enableRandomization>
        <randomizationSeed>2699710311</randomizationSeed>
    </MacRandomization>
</WLANProfile>`;
    const profilePath = path.join(FILE_FOLDER, `${ssid}Profile.xml`);
    // 写入配置文件
    try {
        await fsp.writeFile(profilePath, profileXml);
        console.log(`配置文件成功写入: ${profilePath}`);
    } catch (err) {
        console.error(`写入配置文件失败: ${err}`);
    }
}


// 检查网络连接
function checkConnection(callback) {
    exec('ping -n 3 www.baidu.com', (error, stdout, stderr) => {
        if (error) {
            callback(false);  // ping 失败，表示未连接到网络
        } else {
            callback(true);  // ping 成功，表示已连接到网络
        }
    });
}

module.exports = {
    startServer,
};

startServer();