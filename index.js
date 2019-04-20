#!/usr/bin/env node

const argv = require('optimist').argv
const path = require('path')

//解析参数
if (argv.h || argv.help) {
	require('./lib/help')()
	process.exit()
}

const opts = {
	port:		argv.p || argv.port || 8080,
	root_dir:	(argv._[0] || './').toString(),
	list_dir:	!!(argv.l || argv['list-dir']),
}

//TODO:生成模板
if (argv.g || argv.generator) {
	//避免覆盖现有文件
}

//初始化context
/*
try{
	const name = argv.c || argv.context || 'context.js'
	opts.context = require('./' + path.join(opts.root_dir, name))
}catch(e){
	if (argv.c || argv.context) {
		console.log('failed to load context script:', argv.c||argv.context)
	}
}
*/

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

const main = require('./lib/main')
opts.router = router
main(opts)

module.exports = server
