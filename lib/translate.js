//将url翻译成文件路径
const path = require('path')
const re = new RegExp('/(api|file)/')

class FileInfo {
	constructor(type, pathname){
		this.type = type
		this.pathname = pathname
	}
}

function translate(url,root_dir){
	root_dir = root_dir || './'

	//参数去掉
	const pidx = url.indexOf('?')
	if (pidx >= 0) {
		url = url.substr(0,pidx)
	}

	const match = url.match(re)
	if (match) {
		const type = match[1]
		const pathname = path.join(root_dir, url)
		return new FileInfo(type, pathname)
	} else {
		return null
	}
}

module.exports = translate
