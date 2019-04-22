const path = require('path')
const fs = require('fs')

module.exports = function(dir){
	const dir_path = path.resolve(dir)

	if(fs.existsSync(dir_path)) {
		const stats = fs.statSync(dir_path)

		if(stats.isDirectory()){
			//empty?
			const files = fs.readdirSync(dir_path)
			if(files.length>0){
				console.error('Error: dest dir isn\'t empty!')
				return
			}
		} else {
			console.err('Error: dest isn\'t empty!')
		}

	} else {
		fs.mkdirSync(dir_path)
	}

	//create default directories
	const template_list = [
		{
			dir:'api',
			file:'tutorial.js',
			source:
`
const dep = module.require('depend')

async function handler(input){
	return await dep.fs.readFile('tutorial.txt','utf8')
}
`
		},
		{
			dir:'module',
			file:'depend.js',
			source:
`
module.exports.fs = require('fs')
`
		},
		{
			dir:'file',
			file:'tutorial.html',
			source:
`
<a href="../api/tutorial">go to ../api/tutorial</a>
`
		},
		{
			dir:'volume',
			file:'tutorial.txt',
			source:
`
<!doctype>
<html>
<body>
This text is read from volume/tutorial.txt
<a href="../file/tutorial.html">go to ../file/tutorial.html</a>
</body>
</html>
`
		}
	]

	for(const template of template_list){
		const p = path.join(dir, template.dir)
		fs.mkdirSync(p)
		fs.writeFileSync(path.join(p,template.file),template.source,'utf8')
	}
}
