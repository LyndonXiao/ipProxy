const request = require("request");
const cheerio = require("cheerio");
const sqlite3 = require("sqlite3");

const db = new sqlite3.Database("Proxy.db", (err) => {
  if (!err) {
    console.log("已连接ip池");
  } else {
    console.log("链接代理池失败", err);
  }
});

db.run(
  "CREATE TABLE IF NOT EXISTS proxy(ip char(15), port char(15), type char(15))",
  (err) => {
    if (err) console.log("建表失败", err);
  }
);

const useragent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.98 Safari/537.36";

const headers = {
  "User-Agent": useragent,
};

//添加数据文件
const insertDb = function (ip, port, type) {
  db.run("INSERT INTO proxy VALUES(?, ?, ?)", [ip, port, type]);
};

//提取优化文件数据
const clearN = function (l) {
  let index = 0;
  for (let i = 0; i < l.length; i++) {
    if (l[i] === "" || l[i] === "\n") {
    } else {
      let ips = l[i].replace("\n", "");
      if (index === 0) {
        var ip = ips;
      } else if (index === 1) {
        var port = ips;
      } else if (index === 4) {
        var type = ips;
      }
      index += 1;
    }
  }

  db.get(
    "select * from proxy where ip = ? and port = ?",
    [ip, port],
    (err, res) => {
      if (!err) {
        console.log("爬取ip:" + ip);
        insertDb(ip, port, type);
      }
    }
  );
};

//分析网页内容
const loadHtml = function (data) {
  let l = [];
  let e = cheerio.load(data);
  e("tr").each(function (i, elem) {
    l[i] = e(this).text();
  });
  for (let i = 1; i < l.length; i++) {
    clearN(l[i].split(" "));
  }
};

//链接网络
const requestProxy = function (options) {
  return new Promise((resolve, reject) => {
    request(options, function (err, response, body) {
      if (err === null && response.statusCode === 200) {
        loadHtml(body);
        resolve();
      } else {
        console.log("链接失败", response, err);
        resolve();
      }
    });
  });
};

//生成网址
const ipUrl = function (resolve) {
  const url = "http://www.xicidaili.com/nn/";

  let options = {
    url: url,
    headers,
  };
  let arr = [];

  return new Promise((resolve, reject) => {
    for (let i = 1; i <= 5; i++) {
      options.url = url + i;
      arr.push(requestProxy(options));
    }
    Promise.all(arr).then(function () {
      resolve();
    });
  });
};

//从数据库提取所有ip
const allIp = function (callback, type) {
  if (type) {
    console.log("type", type);
    return db.all(
      "select * from proxy where type = ?",
      [type],
      callback
    );
  } else return db.all("select * from proxy", callback);
};

//代理ip对象
const Proxys = function (ip, port, type) {
  this.ip = ip;
  this.port = port;
  this.type = type;
};

//提取所有ip，通过check函数检查
const runIp = function () {
  allIp((err, response) => {
    if (err) console.log("查询错误", err);
    else {
      for (let i = 0; i < response.length; i++) {
        let ip = response[i];
        let proxy = new Proxys(ip.ip, ip.port, ip.type);
        check(proxy, headers);
      }
    }
  });
};

//检测ip
const check = function (proxy, headers) {
  return new Promise((resolve, reject) => {
    request(
      {
        url: "http://apps.bdimg.com/libs/jquery/2.1.4/jquery.min.js",
        proxy: `${proxy.type.toLowerCase()}://${proxy.ip}:${proxy.port}`,
        strictSSL: false,
        rejectUnauthorized: false,
        method: "GET",
        timeout: 2000,
        headers,
      },
      function (err, response, body) {
        if (!err && response.statusCode == 200) {
          resolve();
        } else {
          removeIp(proxy.ip);
          resolve();
        }
      }
    );
  });
};

//删除命令
const removeIp = function (ip) {
  db.run(`DELETE FROM proxy WHERE ip = '${ip}'`, function (err) {
    if (err) {
      console.log("删除失败", err);
    } else {
      console.log("成功删除" + ip);
    }
  });
};

exports.run = async function () {
  await ipUrl();
  await runIp();
};

exports.check = function () {
    runIp();
};

exports.ips = function (type, callback = null) {
  if (typeof type === "function") {
    callback = type;
    type = undefined;
  }
  if (type && ["HTTP", "HTTPS"].indexOf(type.toUpperCase()) === -1)
    return callback("参数错误", null);
  return allIp(callback, type);
};
