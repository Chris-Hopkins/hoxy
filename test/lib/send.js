import co from 'co'
import http from 'http'
import hoxy from '../../hoxy'

/*
 * Utility for testing hoxy.
 * Alternative to the roundTrip() utility.
 *
 *   send({
 *     path: 'http://acme.com/foo.html',
 *     method: 'POST',
 *     headers: { ... },
 *     body: 'request body data',
 *   })
 *   .through({
 *     // same as 'opts' in hoxy.intercept(opts, cb)
 *   }, function*(req, resp) {
 *     // same as 'cb' in hoxy.intercept(opts, cb)
 *     // *except* this is a generator from which
 *     // promises can be yielded.
 *   })
 *   .to(function*(req, res) {
 *     // same as 'cb' in http.createServer(cb)
 *     // *except* this is a generator from which
 *     // promises can be yielded.
 *   })
 *   .receiving*(function(resp) {
 *     console.log(resp.statusCode)
 *     console.log(resp.headers)
 *     console.log(resp.body)
 *     // this is a generator from which
 *     // promises can be yielded.
 *   })
 *   .promise() // succeeds if all of the above succeeds
 */

class Sender {

  constructor(reqInfo) {
    this._serverHandler = (req, resp) => { resp.end('') }
    this._clientHandler = () => {}
    this._interceptHandlers = []
    this._prom = new Promise((resolve, reject) => {
      setImmediate(() => {
        let server = http.createServer()
        server.listen(0)
        server.on('error', reject)
        server.on('request', (...args) => {
          co.call(this, function*() {
            yield* this._serverHandler(...args)
          }).catch(reject)
        })
        // -----------------
        let proxy = new hoxy.Proxy()
        proxy.listen(0)
        proxy.on('error', reject)
        proxy.on('log', log => {
          if (log.level === 'error') {
            reject(log.error)
          }
        })
        proxy.intercept('request', (req) => {
          req.hostname = 'localhost'
          req.port = server.address().port
        })
        for (let { opts, handler } of this._interceptHandlers) {
          proxy.intercept(opts, handler)
        }
        // -----------------
        let toServer = http.request({
          hostname: 'localhost',
          port: proxy.address().port,
          path: reqInfo.path || 'http://example.com/',
          method: reqInfo.method,
          headers: reqInfo.headers,
        }, response => {
          let body = ''
          response.on('data', chunk => body += chunk.toString('utf8'))
          response.on('end', () => {
            co.call(this, function*() {
              yield* this._clientHandler({
                statusCode: response.statusCode,
                headers: response.headers,
                body: body,
              })
            }).then(resolve, reject)
          })
        })
        let sendBody = reqInfo.body
        if (!(sendBody instanceof Buffer)) {
          sendBody = new Buffer(sendBody || '', 'utf8')
        }
        toServer.end(sendBody)
        // -----------------
        this._close = () => {
          server.close()
          proxy.close()
        }
      })
    })
    this._prom.then(this._close, this._close)
  }

  to(fn) {
    if (typeof fn !== 'function') {
      let obj = fn
        , headers = obj.headers || {}
        , statusCode = obj.statusCode || 200
        , body = obj.body || ''
      fn = function*(req, resp) {
        resp.writeHead(statusCode, headers)
        resp.end(body)
      }
    }
    this._serverHandler = fn
    return this
  }

  through(opts, handler) {
    this._interceptHandlers.push({ opts, handler })
    return this
  }

  receiving(fn) {
    this._clientHandler = fn
    return this
  }

  promise() {
    return this._prom
  }
}

export default function send(reqInfo) {
  return new Sender(reqInfo)
}