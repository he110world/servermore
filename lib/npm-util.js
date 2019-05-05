const npm = require('npm-programmatic')
const path = require('path')
const fs = require('fs')
const util = require('util')
const is_builtin_module = require('is-builtin-module')
const readFileAsync = util.promisify(fs.readFile)

async function get_modules(file_name){
	const source = await readFileAsync(file_name, 'utf8')

	//找到所有的require()调用
	const require_list = []
	const re = /[^\.]require\(([^)]*)\)/g

	let matches
	while(matches=re.exec(source)){
		const p = matches[1].replace(/['"]/g,'').trim()
		if (!p.startsWith('.') && !is_builtin_module(p) && require_list.indexOf(p)===-1) {
			require_list.push(p)
		}
	}
	return require_list
}

module.exports = {
	init:function(dir){
		this._dir = dir
	},
	install:async function(){
		const js_list = []

		for(const i in arguments){
			const a = arguments[i]
			if (Array.isArray(a)) {
				for(const file_name of a){
					if (js_list.indexOf(file_name)===-1) {
						js_list.push(file_name)
					}
				}
			} else if (typeof a === 'string') {
				js_list.push(a)
			}
		}

		const node_modules_dir = path.join(this._dir, 'node_modules')
		const install_list = []

		for(const js_file of js_list){
			let js_path = js_file
			if (!js_path.startsWith('/')) {
				js_path = path.resolve(this._dir, js_path)
			}
			const mod_list = await get_modules(js_path)
			for(const m of mod_list){
				if (install_list.indexOf(m)===-1) {
					const p = path.join(node_modules_dir, m)
					if (!fs.existsSync(p)) {
						install_list.push(m)
					}
				}
			}
		}

		console.log('npm install list',install_list)

		if (install_list.length>0) {
			console.log('begin npm install',install_list,this._dir)
			await npm.install(install_list, {cwd:this._dir,output:true,save:true})
			console.log('end npm install')
		}

	}
}
