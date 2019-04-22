const ApiManager = require('./api-manager.js')
const FileManager = require('./file-manager.js')
const translate = require('./translate')
const superagent = require('superagent')

module.exports = (opts) => {
	const api_manager = new ApiManager(opts)
	const file_manager = new FileManager(opts)

      	async function handler (ctx, next) {
		let body, error, status=400
		const file = translate(ctx.url,opts.root_dir)
		if (file) {
			const method = ctx.request.method
			if (file.type === 'file') {
				//file只能get
				if (method === 'GET') {
					try{
						body = await file_manager.get(file.pathname, ctx)
						status = 200
					}catch(e){
						error = e.message
						status = 404
					}
				}
			} else if (file.type === 'api') {
				//api只能get和post
				if (method === 'GET' || method === 'POST') {
					try{
						body = await api_manager.execute(file.pathname, ctx)
						status = 200
					}catch(e){
						error = e.message
						status = 500
					}
				}
			}
		}

		if (status === 200) {
			ctx.body = body
		} else {
			ctx.status = status
			ctx.body = error
			//ctx.throw(status,error)
		}
	}

	const router = opts.router

	router.get('*', handler)
	router.post('*', handler)
}

