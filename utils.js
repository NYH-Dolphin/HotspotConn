const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs').promises;


function generateQRCode(path, text){
    return new Promise((resolve, reject)=>{
        QRCode.toFile(path, text, { color: { dark: '#008000', light: '#FFFFFF' } }, (err) => {
            if (!err) {
                console.log('已经生成热点二维码');
                resolve();
            }else{
                console.log("二维码生成错误", err);
                reject("二维码生成错误", err);
            }
        });
    })
}

// 解密函数
function decrypt(encryptedData, key, iv) {
    const algorithm = 'aes-256-cbc';
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8'); // 确保编码格式正确
    decrypted += decipher.final('utf8'); // 确保编码格式正确
    return decrypted;
}

// 加密函数
function encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return { iv: iv.toString('hex'), encryptedData: encrypted, key: key.toString('hex') };
}

module.exports = {
    generateQRCode,
    encrypt,
    decrypt,
};