import express from 'express';
import bodyParse from 'body-parser';
import { AlipaySdk } from 'alipay-sdk';
import { config } from './config.js';
import { db } from './database.js';
//import { refund, getBill, closeTrade } from './rarely.js'; // 不常用函数，按需自行找地方找时机调用，要调用哪个函数就填导入哪个函数

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(bodyParse.urlencoded({ extended: true }));
app.use(bodyParse.json());
console.log(new Date());

// 支付宝配置项
const alipaySdk = new AlipaySdk({
    appId: config.appId,
    privateKey: config.privateKey,
    alipayPublicKey: config.alipayPublicKey,
    gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
});

// 获取商品列表
app.get('/goods', async (req, res) => {
    try {
        const goodsList = await db.getGoodsList();
        res.json(goodsList);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

// 获取VIP有效期
app.get('/vip', async (req, res) => {
    try {
        const userId = req.query.uid;
        const vipExpiryDate = await db.getVipExpiryDate(userId);
        res.json({ expiryDate: vipExpiryDate });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

// 处理注册用户请求
app.get('/regist', async (req, res) => {
    try {
        const userId = req.query.uid;
        if (await db.getVipExpiryDate(userId) == null) {
            db.createUser(userId);
            res.status(200).json({ status: "SUCCESS" });
        }
        else { 
            res.status(200).json({ status: "HasRegisted" }); 
        };
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
})

// 处理创建订单请求
app.post('/createTrade',async(req,res)=>{
    try {
        const { userId, goodsName } = req.body;
        // 参数校验
        if (!userId || !goodsName) {
            return res.status(500).json({ error: '参数不完整' });
        }
        // 检查用户是否已注册
        if(await db.getVipExpiryDate(userId) == null){
            return res.status(200).json({ status: "NO_USER" });
        }
        // 检查商品是否存在
        if(await db.getGoodsStock(goodsName) == null){
            return res.status(200).json({ status: "NO_GOODS" });
        }
        // 检查15分钟内是否存在同名未支付订单
        const existingOrderId = await db.getUnpaidOrder(userId, goodsName, 15);
        if (existingOrderId) {
            const payUrl = alipaySdk.pageExec("alipay.trade.wap.pay", "GET", {
                bizContent: {
                out_trade_no: existingOrderId.trade_no,
                total_amount: existingOrderId.total_amount,
                subject: existingOrderId.goods_name,
                product_code: "QUICK_WAP_WAY",
                seller_id: "2088721011046051",
                },
                notify_url: "http://47.96.116.182:3000/notify",
                return_url: "http://47.96.116.182:3000/return",
            });
            return res.status(200).json({ status: payUrl });
        } 
        // 生成新的订单
        else {
            if(await db.getGoodsStock(goodsName) <= 0){
                return res.status(200).json({ status: "SOLD_OUT" });
            }
            // 建新订单并返回支付网址
            const reduceResult = await db.reduceGoodsStock(goodsName); // 将库存数量-1
            if(reduceResult == "STOCK_OUT"){
                return res.status(200).json({ status: "SOLD_OUT" });
            }
            try {
                const totalAmount = parseFloat(await db.getGoodsPrice(goodsName));
                const out_trade_no = `zdjlales${Date.now()}${userId}`;
                // 使用get方法可以直接获得支付链接，实际生产更推荐用post，可填写参数及要求参考：https://opendocs.alipay.com/open-v3/05w4kt
                const orderResult = alipaySdk.pageExec("alipay.trade.wap.pay", "GET", {
                    bizContent: {
                        out_trade_no: out_trade_no,
                        total_amount: totalAmount.toString(),
                        subject: goodsName,
                        product_code: "QUICK_WAP_WAY",
                        seller_id: "2088721011046051",
                    },
                    notify_url: "http://47.96.116.182:3000/notify",
                    return_url: "http://47.96.116.182:3000/return",
                });
                // notify_url和return_url需要定义在bizContent外，否则等于没设置
                // notify_url指支付成功后支付宝发送异步支付结果通知的地址（需要公网IP），下方默认启用处理通知的路由
                // return_url指支付成功后前端自动跳转到的地址，可以设置一个路由来处理这个网址，即向支付宝发起查询，下方默认禁用
                // 二选一就行了，一般有公网IP肯定选notify_url，回调地址就写一个静态网页就行了
                if(orderResult){
                    await db.createTrade(out_trade_no, goodsName, userId, totalAmount);
                    res.status(200).json({ status: orderResult });
                }
            } catch (error) {
                await db.plusGoodsStockByGoodsName(goodsName); // 恢复库存
                res.status(500).json({ error: 'Internal Server Error', message: error.message });
            }
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

// （选项1，必选）异步接收+验签免查询交易方案，稳定性更高
app.post('/notify',async(req,res)=>{
    try {
        if (!req.body || !req.body.out_trade_no) {  
            console.error('异步请求体不存在或商户订单号不存在');  
            return res.send('fail');
        }  
        const { out_trade_no, trade_status } = req.body;

        // 验签异步通知
        const isValidSign = await checkNotify(req.body);
        if (!isValidSign) {
            console.error('异步验签失败');
            return res.send('fail');
        }
        // 数据库查询有无此订单
        const tradeStatus = await db.getTradeStatusById(out_trade_no);
        if (!tradeStatus) {
           console.error('数据库查询不到订单信息');
           return res.send('fail');
        }
        // 检查通知中订单状态，防误充钱
        if (trade_status != 'TRADE_SUCCESS' && trade_status != 'TRADE_FINISHED') {
            console.error('通知的交易状态未符合预期', trade_status);
            return res.send('success');
        } else if(trade_status=='TRADE_CLOSED') {
            // 如果通知中订单状态是交易关闭则回收库存
            if (tradeStatus == 'WAIT_BUYER_PAY') {
                await db.plusGoodsStockByTradeId(out_trade_no);
                return res.send('success');
            }else{
                return res.send('success');
            }
        }
        // 检查数据库中订单状态，防连充两次钱
        if (tradeStatus == 'TRADE_SUCCESS') {
            console.error('数据库查到已经充过钱了', tradeStatus);
            return res.send('success');
        }
        else if (tradeStatus == 'WAIT_BUYER_PAY') {
            try {  
                await db.updateTradeStatus(out_trade_no, 'TRADE_SUCCESS');
                const tradeUser = await db.getTradeUser(out_trade_no);
                const vip_expiry_date = await db.getVipExpiryDate(tradeUser);
                const nowDate = new Date();
                const goodsName = await db.getTradeGoods(out_trade_no);
                const newVipExpiryDate = await getNewVipExpiryDate(vip_expiry_date, goodsName, nowDate);
                await db.updateUserVipExpiryDate(tradeUser, newVipExpiryDate);
                return res.send("success");
            } catch (dbError) {  
                console.error('数据库操作失败', dbError);
                return res.send('fail');
            }
        } else {
            console.error('本地订单状态异常', tradeStatus);
            return res.send('fail');
        }
    } catch (error) {
        console.error('处理异步通知请求时出错', error);
        return res.send("fail"); // 可以更改为res.send("fail"); return false;但不要改返回消息内容。支付宝只接受字符串"success"(消息接收成功，不保证不会再发)或"fail"(消息接收失败，隔一段时间会重新再发)
    }
});
// （选项1，可不选）静态网页用于告诉用户支付结束
app.get('/return', async (req, res) => {
  try {
    const { out_trade_no } = req.query;
    // 参数校验
    if (!out_trade_no) {
      return res.send("订单号参数缺失");
    }
    // 验签校验
    if (!alipaySdk.checkNotifySign(req.query)) {
      return res.send("验签失败，请勿重复提交");
    }
    // 获取订单详情
    const status = await db.getTradeStatusById(out_trade_no);
    const goodsInfo = await db.getTradeGoods(out_trade_no);
    const expiryDate = await db.getVipExpiryDate(await db.getTradeUser(out_trade_no));
    // 构建响应信息
    let message;
    switch(status) {
      case 'TRADE_SUCCESS':
        message = `支付成功！您已成功购买${goodsInfo}，VIP有效期至${expiryDate}`;
        break;
      case 'WAIT_BUYER_PAY':
        message = "等待支付中，若已完成支付请稍后刷新";
        break;
      default:
        message = "支付状态异常，请联系客服";
    }
    res.send(`
      <h2>支付结果通知</h2>
      <p>${message}</p>
      <p>订单号：${out_trade_no}</p>
    `);
  } catch (error) {
    console.error(error);
    res.send("系统繁忙，请稍后再试");
  }
});

// // （选项2，必选）return_url接收+查询交易方案，容错率更高，不需要公网IP，不支持库存数量回收
// app.get('/return',async(req,res)=>{
//     try {
//         const out_trade_no = req.query.out_trade_no;
//         // 验签同步通知
//         const isValidSign = await checkNotify(req.query);
//         if (!isValidSign) {
//             console.error('同步验签失败');
//             return res.send('链接已失效，请重新发起支付');
//         }
//         const trade_info = await getTrade(out_trade_no);
//         // 服务器查询有无此订单
//         if (!trade_info) {
//            console.error('服务器查询不到订单信息');
//            return res.send('查询不到订单信息，充值失败，请联系客服');
//         }
//         // 数据库查询有无此订单
//         const tradeStatus = await db.getTradeStatusById(out_trade_no);
//         if (!tradeStatus) {
//             console.error('数据库查询不到订单信息');
//             return res.send('查询不到订单信息，充值失败，请联系客服');
//          }
//         // 检查结果中订单状态，防误充钱
//         if (trade_info.tradeStatus != 'TRADE_SUCCESS' && trade_info.tradeStatus != 'TRADE_FINISHED') {
//             console.error('查询结果的交易状态未符合预期', trade_info.tradeStatus);
//             return res.send('链接已失效，请重新发起支付');
//         }
//         // 检查数据库中订单状态，防连充两次钱
//         if (tradeStatus == 'TRADE_SUCCESS') {
//             console.error('数据库查到已经充过钱了', tradeStatus);
//             return res.send('充值已经到账了，请在脚本端刷新vip有效期查询是否到账');
//         }
//         else if (tradeStatus == 'WAIT_BUYER_PAY') {
//             try {  
//                 await db.updateTradeStatus(out_trade_no, 'TRADE_SUCCESS');
//                 const tradeUser = await db.getTradeUser(out_trade_no);
//                 const vip_expiry_date = await db.getVipExpiryDate(tradeUser);
//                 const nowDate = new Date();
//                 const goodsName = await db.getTradeGoods(out_trade_no);
//                 const newVipExpiryDate = await getNewVipExpiryDate(vip_expiry_date, goodsName, nowDate);
//                 await db.updateUserVipExpiryDate(tradeUser, newVipExpiryDate);
//                 return res.send("充值成功！请在脚本端刷新vip有效期查询是否到账");
//             } catch (dbError) {  
//                 console.error('数据库操作失败', dbError);
//                 return res.send('充值失败，请联系客服');
//             }
//         } else {
//             console.error('本地订单状态异常', trade_info);
//             return res.send('充值失败，请联系客服');
//         }
//     } catch (error) {
//         console.error('处理前端请求时出错:', error);
//         return res.send("更新订单失败，请勿关闭网页并在5秒后重新刷新网页，直到刷出success为止。原因：", error); // 需要提醒用户支付成功后不要退出浏览器，直到刷新出success后再退出
//     }
// });

// 强制验签，确保异步通知消息来自于支付宝
async function checkNotify(queryObj) {
    try {
        // true | false
        const success = alipaySdk.checkNotifySign(queryObj);
        return success;
    } catch (error) {
        console.error("验签错误", success)
        return false;
    }
}

// 发起交易查询
async function getTrade(out_trade_no) {
    const result = await alipaySdk.exec("alipay.trade.query", {
        bizContent: { "out_trade_no": out_trade_no },
    });
    return result;
}


// 计算新vip有效期
async function getNewVipExpiryDate(currentExpiryDate, goodsName, nowDate) {
    const currentExpiryDateObj = new Date(currentExpiryDate);
    const nowDateObj = new Date(nowDate);
    const vipDuration = goodsName.toString().trim() == '30天VIP' ? 2592000 :
                        goodsName.toString().trim() == '90天VIP' ? 7776000 : 0;
                        goodsName = "30天VIP";
    return nowDateObj >= currentExpiryDateObj
        ? new Date(nowDateObj.getTime() + vipDuration * 1000)
        : new Date(currentExpiryDateObj.getTime() + vipDuration * 1000);
}

// 启动服务器
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});