const path = require('path')
const fs = require('fs')
const git = require('isomorphic-git')

module.exports = (router, opts)=>{
	//https://gogs.io/docs/features/webhook
	function parse_gogs_msg(msg){
		const res = {}
		res.name = msg.repository.full_name
		res.ref = msg.ref
		res.branch = msg.ref.split('/').pop()
		//res.singleBranch = true
		if (msg.commits) {
			res.commits = {
				added:[],
				removed:[],
				modified:[]
			}
			for(const c of msg.commits){
				res.commits.added.push(...c.added)
				res.commits.removed.push(...c.removed)
				res.commits.modified.push(...c.modified)
			}
		}
		res.username = opts.username
		res.password = opts.password
		res.dir = path.resolve(opts.dir, res.name)
		return res
	}

	router.post('/hook/gogs/push', async (ctx,next)=>{
		try{
			const p = parse_gogs_msg(ctx.request.body)
			//if (p.branch === opts.branch) {
			console.log(' [HOOK]\n',p)

			//found repo. pull
			if (fs.existsSync(p.dir)) {
				await git.pull(p)
				console.log(p.name,'updated.')
			} else {
				console.log(p.name,'doesn\'t exist. Ignore.')
			}
			//}
			ctx.body = ''
		}catch(e){
			console.log(e)
			ctx.status = 400
			ctx.body = ''
		}
	})
}
