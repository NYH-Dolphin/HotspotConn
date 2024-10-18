# IoT 设备热点连接服务

## 0. 前置条件
WLAN：Wi-Fi
承载网络：可以理解为热点
SSID：热点 / Wi-Fi 的名称
设备操作系统：Windows 11
确认支持承载网络：
netsh wlan show drivers
看到输出内容中有：支持的承载网络：是
如果不支持承载网络，需要查看是否是设备不支持，还是承载网络服务被关闭

## 1. 配置
以下配置需要在发货前完成

### 1.1 开机自动登录，以管理员权限打开CMD
设置开机无需密码自动登录和以管理员权限打开客户端
以管理员权限自动打开CMD：https://blog.csdn.net/m0_68997646/article/details/128729581
Windows 账户无需密码自动登录：https://blog.csdn.net/agang1986/article/details/131989295
注意确保之后的操作都以管理员权限去调用的（CMD，Powershell）
重新启动电脑

### 1.2 安装依赖所需的应用
ISC 脚本：PSInternetConnectionSharing：https://github.com/loxia01/PSInternetConnectionSharing
以下操作在 Powershell 打开
仔细阅读README，注意将文件粘贴到 
%ProgramFiles%\WindowsPowerShell\Modules
因为这个是额外的Powershell 脚本，需要配置 PowerShell 的执行策略 
Set-ExecutionPolicy RemoteSigned
如果说该脚本有风险，选择允许：Y
通过 
Get-Ics -AllConnections
测试是否已经安装成功

## 2. 设备配网原理
https://bbs.huaweicloud.com/blogs/300292
我们采用的是设备热点配网方案
设备启动时自动开启服务器，服务器同时开启热点
用户扫描自动连接设备热点
用户使用特定的子网 ip 地址  192.168.137.1 和端口 3000 访问 server 的服务
用户选择特定设备配网需要的 Wi-Fi，并输入密码，使用设备热点 SSID 进行对称加密发送 Wi-Fi 和密码的报文
设备服务器接收用户发送的 Wi-Fi 和密码，完成配网，向用户发送配网成功消息，一段时间后关闭承载网络和服务器服务
此时用户连接到的设备的热点通过 WLAN 接入网络，用户在完成配网之后可以切换 Wi-Fi 到正常状态
注意 2-5 期间，用户的手机接入了设备的热点，只能使用配网服务，无法正常访问网络
