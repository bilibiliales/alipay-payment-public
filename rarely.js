// 订单退款接口（自行找地方调用）
async function refund(out_trade_no,refund_amount,refund_reason) {
    try{
        const result = await alipaySdk.exec("alipay.trade.refund", {
            bizContent: {
            out_trade_no: out_trade_no,
            refund_amount: refund_amount,
            refund_reason: refund_reason,
            },
        });
        if(result.msg=="Success") {
            return "SUCCESS;"
        } else {
            console.error("退款失败，原因："+result.msg);
            return result.msg;
        }
    } catch (error) {
        console.error("退款请求异常，原因：", error);
        return error;
    }
}

// 获取查询对账单下载链接（30秒有效期）
async function getBill(date) {
    const result = await alipaySdk.exec(
        "alipay.data.dataservice.bill.downloadurl.query", {
          bizContent: {
            bill_type: "trade",
            bill_date: date,
          },
        }
    )
    return result.bill_download_url;
}

// 关闭当前交易
async function closeTrade(out_trade_no) {
    const result = await alipaySdk.exec("alipay.trade.close", {
        bizContent: {},
    });
    return result.msg;
}

// 导出函数
export { refund, getBill, closeTrade };