import mongoose, { now } from 'mongoose';
// 连接到 MongoDB 数据库
mongoose.connect('mongodb://127.0.0.1:27017/@数据库名称')
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));
// 定义商品模型
const goodsSchema = new mongoose.Schema({
    goods_name: String,
    description: String,
    price: Number,
    stock: Number,
});
const Goods = mongoose.model('goods', goodsSchema);
// 定义用户模型
const userSchema = new mongoose.Schema({
    uid: String,
    vip_expiry_date: { type: Date, default: new Date('1970-1-1T00:00:00Z') },
});
const User = mongoose.model('users', userSchema);
// 定义交易模型
const tradeSchema = new mongoose.Schema({
    trade_no: String,
    goods_name: String,
    user_id: String,
    total_amount: Number,
    trade_status: String,
    send_pay_date: Date,
    created_date: { type: Date, default: Date.now },
});
const Trade = mongoose.model('trades', tradeSchema);
class DB {
    // 获取商品列表
    async getGoodsList() {
        try {
            const goodsItems = await Goods.find();
            return goodsItems.map(item => item.toJSON());
        } catch (error) {
            console.error('Error fetching goods list:', error);
            return error;
        }
    }
    // 查询商品库存
    async getGoodsStock(goodsName) {
        try {
            const goodsItem = await Goods.findOne({ goods_name: goodsName });
            if (!goodsItem) {
                return null;
            }
            return goodsItem.stock;
        } catch (error) {
            console.error('Error getting goods stock:', error);
            return error;
        }
    }
    // 获取商品价格
    async getGoodsPrice(goodsName) {
        try {
            const goodsItem = await Goods.findOne({ goods_name: goodsName });
            if (!goodsItem) {
                return null;
            }
            return goodsItem.price;
        } catch (error) {
            console.error('Error getting goods price:', error);
            return error;
        }
    }
    // 商品库存数量-1
    async reduceGoodsStock(goodsName) {
        try {
            const goodsItem = await Goods.findOne({ goods_name: goodsName });
            if (!goodsItem) {
                return null;
            }
            // 检查库存量
            if (goodsItem.stock <= 0) {
                return "STOCK_OUT";
            }
            // 如果库存大于0，则减少库存
            const updatedGoodsItem = await Goods.findOneAndUpdate(
                { goods_name: goodsName, stock: { $gt: 0 } },
                { $inc: { stock: -1 } },
                { new: true }
            );
            if(!updatedGoodsItem){
                return "STOCK_OUT";
            }
            return "SUCCESS";
        } catch (error) {
            console.error('Error changing goods stock:', error);
            return error;
        }
    }
    // 回收商品库存+1
    async plusGoodsStockByTradeId(tradeId) {
        try {
            await db.updateTradeStatus(tradeId, 'TRADE_CLOSED');
            const goodsName = await db.getTradeGoods(tradeId);
            await Goods.findOneAndUpdate(
                { goods_name: goodsName },
                { $inc: { stock: +1 } },
                { new: true }
            );
            return "SUCCESS";
        } catch (error) {
            console.error('Error changing goods stock:', error);
            return error;
        }
    }
    // 回退库存
    async plusGoodsStockByGoodsName(goodsName) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await conn.query(
            `UPDATE goods SET stock = stock + 1 WHERE goods_name = ?`,
            [goodsName]
          );
          await conn.commit();
        } catch (error) {
          await conn.rollback();
          throw error;
        } finally {
          conn.release();
        }
      }
    // 查询用户vip时间
    async getVipExpiryDate(userId) {
        try {
            const user = await User.findOne({ uid: userId });
            return user ? user.vip_expiry_date : null;
        } catch (error) {
            console.error('Error fetching VIP expiry date:', error);
            return error;
        }
    }
    // 查询单个订单状态
    async getTradeStatusById(tradeId) {
        try {
            const trade = await Trade.findOne({ trade_no: tradeId });
            return trade ? trade.trade_status : null;
        } catch (error) {
            console.error('Error fetching trade:', error);
            return null;
        }
    }
    // 查询单个订单发起人
    async getTradeUser(tradeId) {
        try {
            const trade = await Trade.findOne({ trade_no: tradeId });
            return trade ? trade.user_id : null;
        } catch (error) {
            console.error('Error fetching trade:', error);
            return error;
        }
    }
    // 查询单个订单商品名称
    async getTradeGoods(tradeId) {
        try {
            const trade = await Trade.findOne({ trade_no: tradeId });
            return trade ? trade.goods_name : null;
        } catch (error) {
            console.error('Error fetching trade:', error);
            return error;
        }
    }
    // 查询有无商品同名指定分钟内未支付订单
    async getUnpaidOrder(userId, goodsName, minutes) {
        try {
            const now = new Date();
            now.setMinutes(now.getMinutes() - minutes);
            // 查询未支付的订单
            const trade = await Trade.findOne({
                user_id: userId,
                goods_name: goodsName,
                trade_status: 'WAIT_BUYER_PAY',
                created_date: { $gte: now }
            });
            return trade || null;
        } catch (error) {
            console.error('Error fetching trade:', error);
            return error;
        }
    }
    // 创建订单
    async createTrade(tradeId, goodsName, userId, totalAmount) {
        try {
            const trade = new Trade({
                trade_no: tradeId,
                goods_name: goodsName,
                user_id: userId,
                total_amount: totalAmount,
                trade_status: "WAIT_BUYER_PAY",
                created_date: Date.now(),
            });
            await trade.save();
            return "SUCCESS";
        } catch (error) {
            console.error('Error updating trade:', error);
            return error;
        }
    }
    // 更新用户vip有效期
    async updateUserVipExpiryDate(userId, newDate) {
        try {
            const user = await User.findOneAndUpdate(
                { uid: userId },
                { vip_expiry_date: newDate },
                { new: true }
            );
            return user ? "SUCCESS" : null;
        } catch (error) {
            console.error('Error updating VIP expiry date:', error);
            return error;
        }
    }
    // 修改订单状态
    async updateTradeStatus(tradeId, status) {
        try {
            const user = await Trade.findOneAndUpdate(
                { trade_no: tradeId },
                { trade_status: status, send_pay_date: Date.now() },
                { new: true }
            );
            return user ? user.toJSON() : null;
        } catch (error) {
            console.error('Error updating trade date:', error);
            return error;
        }
    }
    // 创建用户
    async createUser(userId) {
        try {
            const user = new User({ uid: userId, vip_expiry_date: new Date(0) });
            await user.save();
            return "SUCCESS";
        } catch (error) {
            console.error('Error creating user:', error);
            return error;
        }
    }
}
export const db = new DB();