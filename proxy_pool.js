const request = require("request")
const cheerio = require("cheerio")
const sqlite3 = require("sqlite3")
const userAgents = require("./userAgents")
const { options } = require("superagent")
const log = require("./log")

const db = new sqlite3.Database("Proxy.db", (err) => {
  if (!err) {
    log("已连接ip池")
  } else {
    log("链接代理池失败", err)
  }
})

db.run(
  "CREATE TABLE IF NOT EXISTS proxy(ip char(15), port char(15), type char(15))",
  (err) => {
    if (err) log("建表失败", err)
  }
)

const headers = {
  "User-Agent": userAgents[parseInt(Math.random() * userAgents.length)],
}

//添加数据文件
const insertDb = function (ip, port, type) {
  db.run("INSERT INTO proxy VALUES(?, ?, ?)", [ip, port, type])
}

//提取优化文件数据
const clearN = function (l) {
  let index = 0
  for (let i = 0; i < l.length; i++) {
    if (l[i] === "" || l[i] === "\n") {
    } else {
      let ips = l[i].replace("\n", "")
      if (index === 0) {
        var ip = ips
      } else if (index === 1) {
        var port = ips
      } else if (index === 3) {
        var type = ips
      }
      index += 1
    }
  }

  db.get(
    "select * from proxy where ip = ? and port = ?",
    [ip, port],
    (err, res) => {
      if (!err && !res) {
        log("爬取ip:" + ip)
        insertDb(ip, port, type)
      }
    }
  )
}

//分析网页内容
const loadHtml = function (data) {
  let l = []
  let e = cheerio.load(data)
  e("tr").each(function (i, elem) {
    l[i] = e(this).text()
  })
  for (let i = 1; i < l.length; i++) {
    clearN(l[i].split(" "))
  }
}

//链接网络
const requestProxy = function (options) {
  return new Promise((resolve, reject) => {
    request(options, function (err, response, body) {
      if (err === null && response.statusCode === 200) {
        loadHtml(body)
        resolve()
      } else {
        log("链接失败", err, response)
        resolve()
      }
    })
  })
}

//生成网址
const ipUrl = function (resolve) {
  const url = "https://www.kuaidaili.com/free/inha/"

  let options = {
    url: url,
    method: "GET",
    headers,
  }
  let arr = []

  return new Promise((resolve, reject) => {
    for (let i = 1; i <= 5; i++) {
      options.url = url + i + "/"
      arr.push(requestProxy(options))
    }
    Promise.all(arr).then(function () {
      resolve()
    })
  })
}

// 爬取代理ip
const ipFetch = function () {
  const url = "http://proxylist.fatezero.org/proxy.list"

  const options = {
    url: url,
    method: "GET",
    headers,
  }
  log("爬取ip中...")
  return new Promise((resolve, reject) => {
    request(options, function (err, response, body) {
      if (err === null && response && response.statusCode === 200) {
        body
          .toString()
          .split("\n")
          .forEach(function (i) {
            if (i) {
              const j = JSON.parse(i)
              const { host: ip, port, type } = j

              db.get(
                "select * from proxy where ip = ? and port = ?",
                [ip, port],
                (err, res) => {
                  if (!err && !res) {
                    // log("添加ip:" + ip)
                    insertDb(ip, port, type)
                  }
                }
              )
            }
          })

        resolve()
      } else {
        log("链接失败", err, response)
        resolve()
      }
    })
  })
}

// 爬取代理ip
const ipFetch2 = function () {
  const url = "http://api.89ip.cn/tqdl.html?api=1&num=60&port=&address=&isp="

  const options = {
    url: url,
    method: "GET",
    headers,
  }
  log("爬取ip2中...")
  return new Promise((resolve, reject) => {
    request(options, function (err, response, body) {
      if (err === null && response && response.statusCode === 200) {
        const results = body
          .toString().match(/.*?\..*?\..*?\..*?:.*?<br\>/g)
        
          results.forEach(function (i) {
              let arr = i.replace("<br>", "").split(":")
              const ip = arr[0], port = arr[1], type = "http"

              db.get(
                "select * from proxy where ip = ? and port = ?",
                [ip, port],
                (err, res) => {
                  if (!err && !res) {
                    // log("添加ip:" + ip)
                    insertDb(ip, port, type)
                  }
                }
              )
          })

        resolve()
      } else {
        log("链接失败", err, response)
        resolve()
      }
    })
  })
}

//从数据库提取所有ip
const allIp = function (callback, type) {
  if (type) {
    return db.all("select * from proxy where type = ?", [type], callback)
  } else return db.all("select * from proxy", callback)
}

//代理ip对象
const Proxys = function (ip, port, type) {
  this.ip = ip
  this.port = port
  this.type = type
}

//提取所有ip，通过check函数检查
const runIp = function () {
  log('检查ip中...');
  allIp((err, response) => {
    if (err) log("查询错误", err)
    else {
      for (let i = 0; i < response.length; i++) {
        let ip = response[i]
        let proxy = new Proxys(ip.ip, ip.port, ip.type)
        check(proxy, headers)
      }
    }
  })
}

//检测ip
const check = function (proxy, headers) {
  return new Promise((resolve, reject) => {
    request(
      {
        url: "https://m.ctrip.com/restapi/soa2/21710/EstimatePrice",
        proxy: `${proxy.type.toLowerCase()}://${proxy.ip}:${proxy.port}`,
        strictSSL: false,
        rejectUnauthorized: false,
        method: "POST",
        timeout: 2000,
        headers,
      },
      function (err, response, body) {
        if (!err && response.statusCode == 200) {
          resolve()
        } else {
          removeIp(proxy.ip)
          resolve()
        }
      }
    )
  })
}

//删除命令
const removeIp = function (ip) {
  db.run(`DELETE FROM proxy WHERE ip = '${ip}'`, function (err) {
    if (err) {
      log("删除失败", err)
    } else {
      // log("成功删除" + ip)
    }
  })
}

exports.run = async function () {
  // await ipUrl()
  await ipFetch()
  await ipFetch2()
  await runIp()
}

exports.check = function () {
  runIp()
}

exports.removeIp = function(ip) {
  removeIp(ip)
}

exports.ips = function (type, callback = null) {
  if (typeof type === "function") {
    callback = type
    type = undefined
  }
  if (type && ["HTTP", "HTTPS"].indexOf(type.toUpperCase()) === -1)
    return callback("参数错误", null)
  return allIp(callback, type)
}
