const proxy = require("./proxy_pool.js");
const superagent = require("superagent");
const querystring = require("querystring");
const express = require("express");
const userAgents = require("./userAgents.js");
const request = require("request")

require("superagent-proxy")(superagent);

proxy.run();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all("/", (req, res) => {
  if (!req.query.req_url) {
    res.end("params is wrong");
    return;
  }

  let req_url = req.query.req_url;
  let headers = {
    "User-Agent": userAgents[parseInt(Math.random() * userAgents.length)],
  };
  if (req.headers["Content-Type"]) {
    headers["Content-Type"] = req.headers["Content-Type"];
  }
  if (req.headers["Cookie"]) {
    headers["Cookie"] = req.headers["Cookie"];
  }

  delete req.query["req_url"];

  let options = {
    url: req_url + "?" + querystring.stringify(req.query),
    method: req.method,
    headers: headers,
    timeout: 2000,
    body: req.body,
  };

  proxy.ips("http", (err, ips) => {
    if (err) {
      console.log("sql err", err);

      proxyRequest(options, (statusCode, body) => {
        res.status(statusCode).send(body).end();
      });
    } else {
      if (ips.length <= 0) {
        console.log("no proxy ip");
        proxy.run();

        proxyRequest(options, (statusCode, body) => {
          res.status(statusCode).send(body).end();
        });
      } else {
        console.log("ips:" + ips.length);
        const ip = ips[Math.floor(Math.random() * ips.length)];
        options.proxy = `${ip.type.toLowerCase()}://${ip.ip}:${ip.port}`;
        options.proxyIp = ip.ip;
        console.log('代理', options.proxy);

        proxyRequest(options, (statusCode, body) => {
          res.status(statusCode).send(body).end();
        });
      }
    }
  });

  const proxyRequest = (options, callback) => {
    const {url, method, body, headers, proxy: proxyUrl, proxyIp} = options;
    request(
      {
        url,
        method,
        body: JSON.stringify(body),
        headers,
        proxy: proxyUrl,
        strictSSL: false,
        rejectUnauthorized: false
      },
      function (err, response, body) {
        if (!err && response && response.statusCode == 200) {
          console.log('代理请求成功');
          callback(response.statusCode, body);
        } else {
          console.log('代理请求失败', err)
          proxy.removeIp(proxyIp)
          // 不代理试试
          noProxyRequest(options, callback)
        }
      }
    )
  }

  const noProxyRequest = (options, callback) => {
    const {url, method, body, headers} = options;
    request(
      {
        url,
        method,
        body: JSON.stringify(body),
        headers,
        strictSSL: false,
        rejectUnauthorized: false
      },
      function (err, response, body) {
        if (!err && response && response.statusCode == 200) {
          console.log('无代理请求成功');
          callback(response.statusCode, body);
        } else {
          console.log('无代理请求失败', err)
          callback(500, '{"msg": "请求失败", "err": ' + JSON.stringify({err, response}) + '}');
        }
      }
    )
  }

  const proxyRequest2 = (options, callback) => {
    const { url, method, headers, body, proxy: proxyUrl, timeout = 2000 } = options;

    if (proxy)
      superagent(method, url)
        .proxy(proxyUrl)
        .timeout(timeout)
        .set(headers)
        .redirects(2)
        .send(body)
        .retry(2)
        .end((err, response) => {
          if (err || !response) {
            console.log('请求失败', err);
            callback(500, '{"msg": "请求失败", "err": ' + JSON.stringify({err, response}) + '}');
          } else {
            callback(response.statusCode, response.text);
          }
        });
    else
      superagent(method, url)
        .timeout(timeout)
        .redirects(2)
        .send(body)
        .set(headers)
        .retry(2)
        .end((err, response) => {
          if (err || !response) {
            console.log('请求失败', err);
            callback(500, '{"msg": "请求失败", "err": ' + JSON.stringify({err, response}) + '}');
          } else {
            callback(response.statusCode, response.text);
          }
        });
  };
});

app.get("/refresh", (req, res) => {
  proxy.run();
  res.send("ok").end();
});

app.listen(3030, () =>
  console.log("ip proxy server 启动成功，监听 3030 中...")
);

setTimeout(() => {
  proxy.check();
}, 7200000)
