const { exec } = require('child_process');
const iconv = require('iconv-lite');

// 查找 mac 地址
function findMacAddress() {
    return new Promise((resolve, reject) =>{
        exec('ipconfig /all', { encoding: 'buffer' }, (error, stdout, stderr) => {
            const output = iconv.decode(stdout, 'gbk');
            if (error) {
                console.log("出错", output);
            }
            const lines = output.split('\n');
            let ethernet = false;
            let macAddress = '';
            lines.forEach(line => {
                line = line.trim();
                if (line.startsWith('以太网适配器') || line.startsWith('Ethernet adapter')) {
                    ethernet = true;
                }
                if (ethernet && (line.startsWith('物理地址') || line.startsWith('Physical Address')) && !macAddress) {
                    macAddress = line.split(': ')[1].replace(/-/g, '');
                }
            });
    
            if (macAddress) {
                console.log('找到以太网的MAC地址', macAddress);
                resolve(macAddress);
            } else {
                console.log('未找到以太网的MAC地址');
                resolve("");
            }
        });
    });
}

// 创建承载网络 (热点)
function createHotspot(ssid, password) {
    return new Promise((resolve, reject) => {
        const createHostedNetworkCommand = `netsh wlan set hostednetwork mode=allow ssid=${ssid} key=${password}`;
        exec(createHostedNetworkCommand, { encoding: 'buffer' }, (error, stdout, stderr) => {
            if (error) {
                console.error(`创建承载网络时出错: ${stderr}`);
                return reject(`创建承载网络时出错: ${stderr}`);
            }
            const output = iconv.decode(stdout, 'gbk');
            console.log(output);
            resolve(output);
        });
    });
}

// 开启承载网络 (热点)
function startHotspot() {
    return new Promise((resolve, reject) => {
        const startHostnetworkCommand = 'netsh wlan start hostednetwork';
        exec(startHostnetworkCommand, { encoding: 'buffer' }, (error, stdout, stderr) => {
            const output = iconv.decode(stdout, 'gbk');
            if (error) {
                console.error(output);
                return reject(output);
            } else {
                console.log(output);
                return resolve(output);
            }
        });
    });
}

// 关闭承载网络 (热点)
function stopHotspot() {
    return new Promise((resolve, reject) => {
        const startHostnetworkCommand = 'netsh wlan stop hostednetwork';
        exec(startHostnetworkCommand, { encoding: 'buffer' }, (error, stdout, stderr) => {
            const output = iconv.decode(stdout, 'gbk');
            if (error) {
                console.error(output);
                return reject(output);
            } else {
                console.log(output);
                return resolve(output);
            }
        });
    });
}


// 添加指定的 Profile
function addToProfile(profilePath) {
    console.log("添加新的配置文件");
    return new Promise((resolve, reject) => {
        const addProfileCommand = `netsh wlan add profile filename="${profilePath}"`;
        console.log(addProfileCommand);
        exec(addProfileCommand, { encoding: 'buffer' }, (error, stdout, stderr) => {
            if (error) {
                const output = iconv.decode(stdout, 'gbk'); // 将 GBK 编码的输出转换为 UTF-8
                console.error(`添加配置文件失败: ${output}`);
                return reject(`添加配置文件失败: ${output}`);
            }
            const output = iconv.decode(stdout, 'gbk');
            console.log(`配置文件添加成功: ${output}`);
            resolve(`配置文件添加成功: ${output}`);
        });
    });
}

// 删除指定的 Profile
function deleteProfile(ssid) {
    return new Promise((resolve, reject) => {
        const deleteProfileCommand = `netsh wlan delete profile name="${ssid}"`;
        console.log(deleteProfileCommand);
        exec(deleteProfileCommand, { encoding: 'buffer' }, (error, stdout, stderr) => {
            const output = iconv.decode(stdout, 'gbk');
            if (error) {
                console.error(`删除配置文件失败: ${output}`);
                return reject(`删除配置文件失败: ${output}`);
            } else {
                console.log(`配置文件已删除: ${output}`);
                return resolve(`配置文件已删除: ${output}`);
            }
        });
    });

}

// 连接到指定的 Profile 的 Wifi
function connectToProfile(ssid) {
    return new Promise((resolve, reject) => {
        const connectCommand = `netsh wlan connect name="${ssid}"`;
        exec(connectCommand, (error, stdout, stderr) => {
            const output = iconv.decode(stdout, 'gbk');
            if (error) {
                console.error(`连接失败: ${output}`);
                return reject(`连接失败：${output}`);
            }
            console.log(`尝试连接到 ${ssid}`);
            resolve(`正在连接到 ${ssid}...`);
        });
    });
}

// 查找本机曾经注册过的 Profile
function checkExistedProfile() {
    return new Promise((resolve, reject) => {
        const showProfileCmd = 'netsh wlan show profile';
        let profiles = [];
        exec(showProfileCmd, { encoding: 'buffer' }, (error, stdout, stderr) => {
            if (error) {
                console.error(`执行命令时出错: ${stderr}`);
                return reject(`执行命令时出错: ${stderr}`);
            }
            const output = iconv.decode(stdout, 'gbk'); // 将 GBK 编码的输出转换为 UTF-8

            // 使用正则表达式提取用户配置文件的信息
            const regex = /(所有用户配置文件|All User Profile)\s+:\s(.+)/g;
            let match;

            // 提取并去除名称中的额外空白
            while ((match = regex.exec(output)) !== null) {
                profiles.push(match[2].trim());
            }

            if (profiles.length === 0) {
                console.log('没有找到任何配置文件');
            }

            console.log(`提取的配置文件: ${profiles}`);
            resolve(profiles); // 异步执行完后 resolve profiles
        });
    });
}

// 检查网络连接
function checkConnection(callback) {
    exec('ping -n 1 www.baidu.com', (error, stdout, stderr) => {
        if (error) {
            callback(false);  // ping 失败，表示未连接到网络
        } else {
            callback(true);  // ping 成功，表示已连接到网络
        }
    });
}

// 循环检测以太网是否打开
function isEthernetConnected() {
    return new Promise((resolve, reject) => {
        exec('ipconfig /all', { encoding: 'buffer' }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`执行命令时出错: ${stderr}`));
                return;
            }
            const output = iconv.decode(stdout, 'gbk');
            const lines = output.split('\n');
            
            let ethernet = false;
            let mediaDisconnected = false; 
            
            lines.forEach(line => {
                line = line.trim();
                
                if (line.startsWith('以太网适配器') || line.startsWith('Ethernet adapter')) {
                    ethernet = true;
                }
                
                if (ethernet && (line.startsWith('媒体状态') || line.startsWith('Media State'))) {
                    if (line.includes('已断开连接') || line.includes('disconnected')) {
                        mediaDisconnected = true;
                    }else{ // 连接的情况
                        mediaDisconnected = false;
                        resolve(true); 
                        console.log('以太网已连接');
                        return;
                    }
                }
                
                
            });

            if (mediaDisconnected) {
                resolve(false); 
                console.log('以太网未连接');
                return;
            }
        });
    });
}

module.exports = {
    findMacAddress,
    createHotspot,
    startHotspot,
    stopHotspot,
    addToProfile,
    deleteProfile,
    checkExistedProfile,
    connectToProfile,
    checkConnection,
    isEthernetConnected,
};
