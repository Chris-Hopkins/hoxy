/*
 * Copyright (c) 2014 by Greg Reimer <gregreimer@gmail.com>
 * MIT License. See mit-license.txt for more info.
 */

import Body from './body'
import _ from 'lodash-node'
import url from 'url'

// ---------------------------

var validProtocols = {
  'http:': true,
  'https:': true,
}

var removeHeaders = {
  'accept-encoding': true, // until proxy handles gzip
  'proxy-connection': true,
  'proxy-authorization': true,
}

var nonEntityMethods = {
  GET: true,
  HEAD: true,
  TRACE: true,
}

/**
 * Represents an HTTP request.
 */
export default class Request extends Body {

  constructor() {
    super()
    this._data = { slow: {} }
  }

  // -------------------------------------------------

  /**
   * Getter/setter for HTTP protocol, e.g. 'http:'
   */
  get protocol(){
    return this._getRawDataItem('protocol')
  }

  set protocol(protocol){
    if (!validProtocols.hasOwnProperty(protocol)) {
      throw new Error('invalid protocol: ' + protocol) // TODO: test this
    }
    this._setRawDataItem('protocol', protocol)
  }

  /**
   * Getter/setter for host name. Does not incude port.
   */
  get hostname(){
    return this._getRawDataItem('hostname')
  }

  set hostname(hostname){
    if (!hostname){
      throw new Error('invalid hostname: ' + hostname) // TODO: test this
    }
    this._setRawDataItem('hostname', hostname)
  }

  /**
   * Getter/setter for port.
   */
  get port(){
    return this._getRawDataItem('port')
  }

  set port(port){
    var parsedPort = parseInt(port)
    if (!parsedPort){
      throw new Error('invalid port: ' + port) // TODO: test this
    }
    this._setRawDataItem('port', parsedPort)
  }

  /**
   * Getter/setter for HTTP method.
   */
  get method(){
    return this._getRawDataItem('method')
  }

  set method(method){
    if (!method){
      throw new Error('invalid method') // TODO: test this
    }
    this._setRawDataItem('method', method.toUpperCase())
  }

  /**
   * Getter/setter for URL. Root-relative.
   */
  get url(){
    return this._getRawDataItem('url')
  }

  set url(aUrl){
    if (!/^\//.test(aUrl)){
      throw new Error('invalid url, must start with /') // TODO: test this
    }
    this._setRawDataItem('url', aUrl)
  }

  /**
   * Getter/setter for HTTP request header object.
   */
  get headers(){
    return this._getRawDataItem('headers')
  }

  set headers(headers){
    this._setRawDataItem('headers', _.extend({}, headers))
  }

  // -------------------------------------------------

  fullUrl(u){
    if (u){
      var purl = url.parse(u)
      if (purl.protocol) { this.protocol = purl.protocol }
      if (purl.hostname) { this.hostname = purl.hostname }
      if (purl.port) { this.port = purl.port }
      if (purl.path) { this.url = purl.path }
      return undefined
    } else {
      var portStr = ''
      var declaredPort = this._getDeclaredPort()
      if (declaredPort) {
        portStr = ':' + declaredPort
      }
      return this.protocol + '//' + this.hostname + portStr + this.url
    }
  }

  // -------------------------------------------------

  _setHttpSource(inReq, reverse){
    var u = inReq.url
    if (reverse){
      u = url.resolve(reverse, u)
    }
    var purl = url.parse(u)
    if (reverse){
      inReq.headers.host = purl.host
      if (!purl.protocol){
        throw new Error('missing protocol on reverse proxy')
      }
    }
    var host = (() => {
      var aHost = inReq.headers.host
      var result = {}
      if (aHost){
        var matches = aHost.match(/^([^:]+)(:([\d]+))?$/)
        if (matches){
          result.name = matches[1]
          var port = parseInt(matches[3])
          if (port){
            result.port = port
          }
        }
      }
      return result
    })()
    this.httpVersion = inReq.httpVersion
    this.headers = inReq.headers
    this.protocol = purl.protocol || 'http:'
    this.hostname = purl.hostname || host.name
    var port = purl.port || host.port
    if (port){
      this.port = port
    }
    //this.port = purl.port || host.port || this._getDefaultPort()
    this.method = inReq.method
    this.url = purl.path
    inReq._isOriginal = true
    this._source = inReq
  }

  /**
   * Returns the default port given the current protocol.
   */
  _getDefaultPort(){
    return this.protocol === 'https:' ? 443 : 80
  }

  /**
   * Returns the port declared in the host header or undefined.
   */
  _getDeclaredPort(){
    var declaredPort = this.port
    if (declaredPort === this._getDefaultPort() && this.headers.host){
      var matches = this.headers.host.match(/^[^:]+:(\d+)$/) || []
      if (!matches[1]){
        declaredPort = undefined
      }
    }
    return declaredPort
  }

  // TODO: emit debug log events for things that are changed.
  _finalize(){
    if (nonEntityMethods.hasOwnProperty(this.method)) {
      this.string = '' // TODO: test
    }
    if (!this._source){
      this.string = '' // TODO: test?
    }

    if (!this._source._isOriginal){
      delete this.headers['content-length']
      if (typeof this._source.finalize === 'function'){
        this._source.finalize()
      }
      if (typeof this._source.size === 'function'){
        this.headers['content-length'] = this._source.size()
      }
    }

    Object.keys(this.headers).forEach(name => {
      // TODO: test
      if (removeHeaders.hasOwnProperty(name)) {
        delete this.headers[name]
      } else if (this.headers[name] === undefined){
        delete this.headers[name]
      }
    })

    // TODO: test host header correction
    var portStr = ''
    var declaredPort = this._getDeclaredPort()
    if (declaredPort) { portStr += ':' + declaredPort }
    this.headers.host = this.hostname + portStr
  }
}
