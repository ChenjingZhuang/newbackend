/**
 * 数据库初始化脚本
 */
const fs = require('fs');
const { Pool } = require('pg');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 创建数据库连接池
const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT || 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

// 读取SQL文件
const sql = fs.readFileSync('./db/init.sql', 'utf8');

// 执行SQL
async function initDb() {
    try {
        await pool.query(sql);
        console.log('✅ 数据库表创建成功');
        process.exit(0);
    } catch (err) {
        console.error('❌ 执行SQL时出错:', err);
        process.exit(1);
    }
}

// 运行初始化
initDb(); 