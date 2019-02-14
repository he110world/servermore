#!/usr/bin/env node

const argv = require('optimist').argv
const path = require('path')

//const os = require('os')
//const ifaces = os.networkInterfaces()

//解析参数
if (argv.h || argv.help) {
	require('./lib/help')()
	process.exit()
}

const opts = {
	port:		argv.p || argv.port || 8080,
	root_dir:	argv._[0] || './',

	//file_dir:	argv.f || argv['file-dir'] || 'file',
	//file_route:	argv['file-route'] || 'file',

	//api_dir:	argv.a || argv['api-dir'] || 'api',
	//api_route:	argv['api-route'] || 'api',

	list_dir:	!!(argv.l || argv['list-dir']),
}

//TODO:生成模板
if (argv.g || argv.generator) {
	//避免覆盖现有文件
}

//初始化context
try{
	const name = argv.c || argv.context || 'context.js'
	opts.context = require('./' + path.join(opts.root_dir, name))
}catch(e){
	if (argv.c || argv.context) {
		console.log('failed to load context script:', argv.c||argv.context)
	}
}

//创建服务器
const Koa = require('koa')
const Router = require('koa-router')
const app = new Koa()
const router = new Router()

const json = require('koa-json')
const onerror = require('koa-onerror')
const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')

onerror(app)
app
.use(logger())
.use(bodyparser())
.use(json())
.use(router.routes())
.use(router.allowedMethods())

app.on('error', function(err, ctx) {
	console.error('server error', err)
})

const server = app.listen(opts.port, () => {
	console.log(`servermore listening on port ${opts.port}`)
})

const backend = require('./lib/backend')
opts.router = router
backend(opts)

module.exports = server
