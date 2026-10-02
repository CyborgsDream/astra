import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const milestone=process.argv[2] || 'checkpoint';
if(!/^[a-z0-9_-]+$/i.test(milestone))throw new Error('Use a short milestone name containing letters, digits, underscores or hyphens.');
const output=path.resolve(process.argv[3] || path.join(root,'..','checkpoints'));
await mkdir(output,{recursive:true});
const now=new Date();
const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(now).replace(/[-:]/g,'').replace(' ','_');
const filename=`ASTRA_CITY_checkpoint_${stamp}_${milestone}.zip`;
const archive=path.join(output,filename);
const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
const manifestPath=path.join(root,'cloud/checkpoint-manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const entry={milestone,createdAt:now.toISOString(),filename,sourceCommit:commit,archivePath:archive,status:'local',includesWorkingTree:true};
manifest.updatedAt=entry.createdAt;
manifest.checkpoints=manifest.checkpoints.filter(item=>item.filename!==filename);
manifest.checkpoints.push(entry);
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const python=`import hashlib,json,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])
excluded={'.git','node_modules','.sites-runtime','.sites-checkout','test-results','checkpoints','__pycache__'}
files=[p for p in root.rglob('*') if p.is_file() and not any(part in excluded for part in p.relative_to(root).parts) and not p.name.startswith('.env') and p.suffix not in {'.log','.zip'}]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(files): z.write(p,'astra-city/'+str(p.relative_to(root)))
with zipfile.ZipFile(out) as z:
 bad=z.testzip()
 if bad: raise RuntimeError('Archive integrity failure: '+bad)
 required=['PROJECT_STATE.md','IMPLEMENTED.md','TODO_NEXT.md','BUILD.md','CHANGELOG.md','cloud/checkpoint-manifest.json','package.json','src/main.js']
 for name in required:
  if 'astra-city/'+name not in z.namelist(): raise RuntimeError('Missing recovery file: '+name)
print(json.dumps({'archive':str(out),'bytes':out.stat().st_size,'files':len(files),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'integrity':'passed'}))`;
const result=spawnSync('python3',['-c',python,root,archive],{encoding:'utf8'});
if(result.status!==0)throw new Error(result.stderr || 'Checkpoint failed.');
const verified=JSON.parse(result.stdout);
Object.assign(entry,verified);
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
await writeFile(archive+'.json',JSON.stringify({...entry,archiveFolderUrl:manifest.archiveFolderUrl},null,2)+'\n');
console.log(JSON.stringify(entry));
