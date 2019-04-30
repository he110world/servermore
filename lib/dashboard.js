const util = require('util')
const fs = require('fs')
const path = require('path')
const mime = require('mime')
const readFileAsync = util.promisify(fs.readFile)
let imgui_src, dashboard_src

const file_dict = {}
const error_dict = {}

function not_found(ctx){
	ctx.status = 404
	ctx.body = 'not found'
}

module.exports = (router, opts)=>{
	router.get('/dashboard/imgui.min.js', async (ctx,next)=>{
		if (!imgui_src) {
			const imgui_path = path.resolve(__dirname, '../node_modules/imgui/imgui.min.js')
			imgui_src = await readFileAsync(imgui_path)
		}
		ctx.type = 'text/javascript'
		ctx.body = imgui_src
	})

	router.get('/dashboard/:file', async (ctx,next)=>{
		const file_path = path.resolve(__dirname, '../html/dashboard', ctx.params.file)

		console.log(file_path)

		if (error_dict[file_path]) {
			not_found(ctx)
			return
		}

		let file_content = file_dict[file_path]
		if (!file_content) {
			try{
				file_content = await readFileAsync(file_path)
			}catch(e){
				not_found(ctx)
				return
			}
		}

		ctx.type = mime.getType(file_path)
		ctx.body = /*file_dict[file_path] =*/ file_content
	})

	router.get('/dashboard', async (ctx,next)=>{
		ctx.redirect('/dashboard/index.html')
	})

}
