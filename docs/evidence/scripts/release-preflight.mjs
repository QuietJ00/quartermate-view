// Read-only Git checks. Does not build, migrate, deploy, or grant release approval.
import {execFileSync} from 'node:child_process';

const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try {
 const [approved,frontend,backend,...extra]=process.argv.slice(2);
 if(extra.length||![approved,frontend,backend].every(x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x)))throw new Error('Usage: npm run release:check -- <approved full SHA> <Claude full SHA> <Codex full SHA>');
 if(git('status','--porcelain','--untracked-files=all'))throw new Error('Release checkout is dirty or has untracked files. Use a clean, separate checkout.');
 if(git('rev-parse','HEAD')!==approved)throw new Error('HEAD does not match the approved SHA.');
 for(const [label,sha] of [['Claude',frontend],['Codex',backend]]){
  try {git('merge-base','--is-ancestor',sha,approved);}catch {throw new Error(`${label} completion commit is missing from the candidate.`);}
 }
 // Consult the actual remote, not a potentially stale origin/main cache.
 const remote=git('ls-remote','--exit-code','origin','refs/heads/main').split(/\s+/)[0];
 if(remote!==approved)throw new Error('Candidate is not the current pushed origin/main. Integrate and review both tasks first.');
 console.log(`PASS: clean checkout, approved HEAD ${approved}, both completion commits included, and live origin/main match. No deployment performed; approval, tests and production-build checks are still required.`);
}catch(error){
 // Do not print raw Git stderr; remote URLs can embed credentials.
 console.error(`Release preflight blocked: ${error instanceof Error&&error.status===undefined?error.message:'Git check failed. Verify repository, origin access and required commits.'}`);
 process.exitCode=1;
}
