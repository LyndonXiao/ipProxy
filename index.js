const proxy = require("./proxy_pool.js");
const superagent = require("superagent");
const querystring = require("querystring");
const express = require("express");
const userAgents = require("./userAgents.js");

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

  proxy.check();

  proxy.ips("HTTP", (err, ips) => {
    if (err) {
      console.log("sql err", err);

      requestUrl(options, (statusCode, body) => {
        res.status(statusCode).send(body).end();
      });
    } else {
      if (ips.length <= 0) {
        console.log("no proxy ip");
        proxy.run();

        requestUrl(options, (statusCode, body) => {
          res.status(statusCode).send(body).end();
        });
      } else {
        const ip = ips[Math.floor(Math.random() * ips.length)];
        options.proxy = `${ip.type.toLowerCase()}://${ip.ip}:${ip.port}`;
        console.log(options.proxy);

        requestUrl(options, (statusCode, body) => {
          res.status(statusCode).send(body).end();
        });
      }
    }
  });

  const requestUrl = (options, callback) => {
    const { url, method, headers, body, proxy, timeout = 2000 } = options;

    if (proxy)
      superagent(method, url)
        .proxy(proxy)
        .timeout(timeout)
        .set(headers)
        .redirects(2)
        .send(body)
        .retry(2)
        .end((err, response) => {
          if (err) {
            console.log(err);
            callback(500, "服务器错误");
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
          if (err) {
            console.log(err);
            callback(500, "服务器错误");
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
