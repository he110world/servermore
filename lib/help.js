module.exports = function(){
	const help_str = 
`
usage: [path] [options]

options:
	-p			Port to use [8080]
	-f --file-dir		File directory [file]
	-a --api-dir		API directory [api]
	--file-route		File route [file]
	--api-route		API route [api]
	-r --route		Route remapping script [route.js]
	-c --context		Script to create context [context.js]
	-l --list-dir		List files in directory [false]
	-g --generator		Generate default directories and files
`
	console.log(help_str)
}
