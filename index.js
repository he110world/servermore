#!/usr/bin/env node
const opt = require('optimist')
const argv =
opt
.usage('Usage: sm [options] [target directory]')
.string('H').alias('H','hook').describe('H','Hook for error 404')
.alias('P','port').default('P',8080).describe('P', 'Listening port')
.string('g').alias('g','generate').describe('g','Generate project template')
.boolean('h').alias('h','help').describe('h','Display help and exit')
.argv

if (argv.h) {
	console.log(opt.help())
	process.exit(0)
}

const path = require('path')

const opts = {
	port:		argv.port,
	root_dir:	(argv._[0] || './').toString(),
	list_dir:	!!(argv.l || argv['list-dir']),
	hook:		argv.hook || ''
}

if (argv.g || argv.generate) {
	require('./lib/generate')(opts.root_dir)

	console.log(`Project generated. Now run 'sm ${opts.root_dir}' to start the service!`)
	process.exit()
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
const formidable = require('koa2-formidable')

onerror(app)
app
.use(logger())
.use(formidable())
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
