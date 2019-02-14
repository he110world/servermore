const FunctionManager = require('./function-manager.js')
const FileManager = require('./file-manager.js')
const translate = require('./translate')

module.exports = (opts) => {
	const func_manager = new FunctionManager(opts)
	const file_manager = new FileManager(opts)

      	async function handler (ctx, next) {
		const file = translate(ctx.url,opts.root_dir)
		let body, error, status=400
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
						body = await func_manager.execute(file.pathname, ctx)
						status = 200
					}catch(e){
						error = e.message
						status = e.status
					}
				}
			}
		}

		if (status === 200) {
			ctx.body = body
		} else {
			ctx.throw(status,error)
		}
	}

	const router = opts.router

	router.get('*', handler)
	router.post('*', handler)
}
