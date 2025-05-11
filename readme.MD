
# 支付宝支付集成项目

## 📂 文件结构

├── node_modules/ # 项目依赖库（已加入.gitignore）
├── app.js # 主程序入口
├── config.js # 【重要】支付配置参数（需修改为真实参数）
├── database/ # 数据库交互模块
├── package.json # 项目配置（包含 "type": "module" 时使用import语法）
├── package-lock.json # 依赖库版本锁定（请勿手动修改）
└── rarely.js # 扩展功能模块（包含退款/查询等附加功能）

## 🚀 快速开始

### 安装依赖
```bash
# 在项目根目录执行
npm install

配置参数
修改 config.js：

// 沙箱环境示例
export default {
  appId: '202100xxxxx',       // 应用ID
  privateKey: 'MIIEvAIBADAN...', // PKCS8格式私钥
  alipayPublicKey: 'MIIBIjAN...', // 支付宝公钥
  notifyUrl: 'http://your-domain.com/notify',
  returnUrl: 'http://your-domain.com/return'
}


⚙️ 核心功能
数据库连接

// 使用 CommonJS
const { db } = require('./database');
 
// 使用 ESModule
import { db } from './database.js';


启用与禁用代码：
1、选中代码块
2、按下"Ctrl"+"K"+"C"禁用代码
3、按下"Ctrl"+"K"+"U"重新启用代码
（适用于VSCode编辑器）


关于方案选择：
一、请求用GET/POST:
GET：根据请求信息生成支付链接
POST：生成Form标签，可插入到浏览器或做成HTML文件发送给前端

二、实时处理订单方法：
方案组合  启用方式                          注意事项                      
方案1   同时启用 return_url 和 notify_url  删除 return_url 可单独使用异步通知   
方案2   仅启用 notify_url                与方案1互斥，需删除 return_url 参数  


关于rarely.js：里面封装了一些不常使用的函数，可以根据实际情况调用

refund(out_trade_no,refund_amount,refund_reason) // 发起退款接口，参数（商户订单号，退款金额，退款理由）*退款金额不能超过实付金额

getTrade(out_trade_no) // 发起交易查询，参数（商户订单号）*有一定概率请求错误返回504

getBill(date) // 获取查询对账单下载链接，参数（日期）*格式：日期格式为yyyy-MM-dd，例如："2025-03-15"

closeTrade(out_trade_no) //关闭指定订单，参数（商户订单号）*只有等待买家付款状态下才能发起交易关闭


安全警告：
永远不要提交包含真实密钥的 config.js 到版本控制
生产环境必须启用HTTPS


🔄 版本兼容
特性	支持版本
ESModule	Node.js 14.0+
CommonJS	Node.js 12.0+
支付宝新API	alipay-sdk 4.10+
