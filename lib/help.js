module.exports = function(){
	const help_str = 
`
usage: [options] [path] 

options:
	-p			Port to use [8080]
	-l --list-dir		List files in directory [false]
	-g --generate		Generate default directories and files
`
	console.log(help_str)
}
