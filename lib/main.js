const ApiManager = require('./api-manager.js')
const FileManager = require('./file-manager.js')
//const hook = require('./hook')
const path = require('path')
const url_util = require('url')

module.exports = (router, opts) => {
	const api_manager = new ApiManager(opts)
	const file_manager = new FileManager(opts)

      	async function handler (ctx, next) {
		//把url翻译成文件路径
		//user/repo/{api/file}/...
		const url_info = url_util.parse(ctx.url)
		const url = url_info.pathname
		const [user,repo,branch,type] = url.split('/').filter(a=>a)

		console.log(ctx.url)

		if (type==='api'||type==='file') {
			//await hook.post(opts.hook, {cmd:'branch',path:[user,repo].join('/')})

			const relative_path = url.split('/').splice(1).join('/')
			const abs_path = path.resolve(opts.dir, relative_path)

			if (type === 'file') {
				try{
					ctx.body = await file_manager.get(abs_path, ctx)
				}catch(e){
					console.log(e)
					ctx.status = 404
					ctx.body = 'not found'
				}

			} else { //api
				try{
					ctx.body = await api_manager.execute(abs_path, ctx)
				}catch(e){
					console.log(e)
					ctx.status = 500
					ctx.body = e.message
				}
			}
		} else {
			ctx.status = 404
			ctx.body = 'not found'
		}
	}

	router.get('*', handler)
	router.post('*', handler)
}

