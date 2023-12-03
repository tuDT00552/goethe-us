const express = require('express')
const mysql = require('mysql2');
const cors = require('cors');
const app = express()

app.use(cors());

app.use(express.json());

const dbConfig = {
  host: '103.200.23.80',
  user: 'herokuap_tudt',
  password: 'Agglbtpg123',
  database: 'herokuap_tudt',
  waitForConnections: true,
  connectionLimit: 10000,
  queueLimit: 0,
  connectTimeout: 180000
};

const pool = mysql.createPool(dbConfig);

async function queryWithRetry(query, params) {
  try {
    const [results] = await pool.promise().query(query, params);
    return results;
  } catch (error) {
    if (error.code === 'ETIMEDOUT') {
      return queryWithRetry(query, params);
    } else {
      throw error;
    }
  }
}

app.get('/api/users', async (req, res) => {
  try {
    const isActive = req.query.isActive || 1;
    const results = await queryWithRetry(
      'SELECT * FROM users WHERE isActive = ? ORDER BY startDate ASC, endDate ASC',
      [isActive]
    );

    const processedResults = results.map(row => ({
      ...row,
      isActive: row.isActive === 1 ? true : false,
    }));

    res.json(processedResults);
  } catch (error) {
    console.error('Lỗi truy vấn: ' + error.stack);
    res.status(200).json({ error: 'Lỗi truy vấn cơ sở dữ liệu' });
  }
});


app.get('/api/users/update', async (req, res) => {
  const { id, isActive } = req.query;

  if (!id || !isActive || (isActive !== '0' && isActive !== '1')) {
    return res.status(200).json({ error: 'Thiếu tham số hoặc tham số không hợp lệ' });
  }

  try {
    const connection = mysql.createConnection(dbConfig);

    connection.query('UPDATE users SET isActive = ? WHERE id = ?', [isActive, id], (error, results) => {
      connection.end();

      if (error) {
        console.error('Lỗi cập nhật: ' + error.stack);
        res.status(200).json({ error: 'Lỗi cập nhật cơ sở dữ liệu' });
      } else {
        if (results.affectedRows === 1) {
          res.json({ success: 'Cập nhật thành công' });
        } else {
          res.status(200).json({ error: 'Không tìm thấy người dùng với id đã cho' });
        }
      }
    });
  } catch (error) {
    console.error('Lỗi kết nối: ' + error.stack);
    res.status(200).json({ error: 'Lỗi kết nối cơ sở dữ liệu' });
  }
});


app.get('/api/users/delete', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(200).json({ error: 'Thiếu tham số id' });
  }

  try {
    const connection = mysql.createConnection(dbConfig);

    connection.query('DELETE FROM users WHERE id = ?', [id], (error, results) => {
      connection.end();

      if (error) {
        console.error('Lỗi xoá: ' + error.stack);
        res.status(200).json({ error: 'Lỗi xoá cơ sở dữ liệu' });
      } else {
        if (results.affectedRows === 1) {
          res.json({ success: 'Xoá thành công' });
        } else {
          res.status(200).json({ error: 'Không tìm thấy người dùng với id đã cho' });
        }
      }
    });
  } catch (error) {
    console.error('Lỗi kết nối: ' + error.stack);
    res.status(200).json({ error: 'Lỗi kết nối cơ sở dữ liệu' });
  }
});


// ------------------------------------------------------------------------------------------------


app.get('/api/users-reg', async (req, res) => {
  try {
    const bot = req.query.bot; // Lấy giá trị của tham số bot từ request query.
    const isActive = req.query.isActive || 1;

    let query;
    let queryParams;

    if (bot) {
      // Nếu có tham số bot, sử dụng LIKE để tìm kiếm trong cột bot và chỉ lấy isReg = true.
      query = 'SELECT * FROM users WHERE isActive = ? AND bot LIKE ? AND isReg = true ORDER BY startDate ASC, endDate ASC';
      queryParams = [isActive, `%${bot}%`];
    } else {
      // Nếu không có tham số bot, truy vấn tất cả dữ liệu với isReg = true.
      query = 'SELECT * FROM users WHERE isActive = ? AND isReg = true ORDER BY startDate ASC, endDate ASC';
      queryParams = [isActive];
    }

    const results = await queryWithRetry(query, queryParams);

    const processedResults = results.map(row => ({
      ...row,
      isActive: row.isActive === 1 ? true : false,
    }));

    res.json(processedResults);
  } catch (error) {
    console.error('Lỗi truy vấn: ' + error.stack);
    res.status(200).json({ error: 'Lỗi truy vấn cơ sở dữ liệu' });
  }
});

// ----------------------------------------------

app.get('/api/get-one', async (req, res) => {
  try {
    const results = await queryWithRetry(`
      SELECT * 
      FROM herokuap_tudt.users
      WHERE isReg = true AND isActive = true AND isProcess = false
      ORDER BY sort ASC
      LIMIT 1
    `);

    if (results.length === 0) {
      res.json(null);
      return;
    }

    const processedResult = {
      ...results[0],
      isActive: results[0].isActive === 1 ? true : false,
      isReg: results[0].isReg === 1 ? true : false,
      isProcess: results[0].isProcess === 1 ? true : false,
    };

    await queryWithRetry(`
      UPDATE herokuap_tudt.users
      SET isProcess = true
      WHERE id = ?
    `, [processedResult.id]);

    const randomTimeout = Math.floor(Math.random() * (40000 - 20000 + 1)) + 20000;
    setTimeout(() => {
      resetIsProcess(processedResult.id);
    }, randomTimeout);

    res.json(processedResult);
  } catch (error) {
    console.error('Lỗi truy vấn hoặc cập nhật: ' + error.stack);
    res.status(500).json({ error: 'Lỗi truy vấn hoặc cập nhật cơ sở dữ liệu' });
  }
});

async function resetIsProcess(id) {
  await queryWithRetry(`
    UPDATE herokuap_tudt.users
    SET isProcess = false
    WHERE id = ?
  `, [id]);
}

// -----------------------------------------------

app.get('/api/get-url', async (req, res) => {
  try {
    const query = 'SELECT * FROM urls LIMIT 1';

    const results = await queryWithRetry(query);

    if (results.length > 0) {
      const url = results[0].url;
      res.json(url);
    } else {
      res.status(200).json({ error: 'Không tìm thấy bản ghi nào trong bảng "urls"' });
    }
  } catch (error) {
    console.error('Lỗi truy vấn: ' + error.stack);
    res.status(200).json({ error: 'Lỗi truy vấn cơ sở dữ liệu' });
  }
});




app.listen(3000, () => {
  console.log('Server is up on 3000')
})


module.exports = app;
