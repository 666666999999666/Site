import assert from 'node:assert/strict'
import test from 'node:test'
import { dueDateInput, editableTodoSubtasks, todoMutationInput, filterTodos, type TodoListEntry } from "../components/admin/todo-model"
// Expectations were first run against the original TodoList bodies before extraction.
const emptyDraft = {title:' title ',description:'',categoryId:'',projectId:'',priority:'',dueDate:'',completionCriteria:'',subtasks:[]}
function item(overrides: Partial<TodoListEntry & { id: string }> = {}): TodoListEntry & { id: string } {
 return {id:'todo',title:'title',description:null,completionCriteria:null,categoryId:null,project:null,subtasks:[],status:'TODO',priority:null,createdAt:'2026-10-01T00:00:00Z',...overrides}
}

test('subtask hydration copies only editable fields and keeps persisted identity', () => {
 const source = [{id:'s',title:' title ',completed:true,sortOrder:8,internal:'not draft'}]
 assert.deepEqual(editableTodoSubtasks(source),[{id:'s',clientId:'s',title:' title ',completed:true}])
 assert.notEqual(editableTodoSubtasks(source)[0], source[0])
 assert.deepEqual(editableTodoSubtasks([]),[])
})
test('Todo save converts blank optional fields to null but preserves authored whitespace', () => {
 assert.deepEqual(todoMutationInput(emptyDraft),{title:' title ',description:null,categoryId:null,projectId:null,priority:null,dueDate:null,completionCriteria:null,subtasks:[]})
 assert.deepEqual(todoMutationInput({...emptyDraft,description:' ',completionCriteria:' criteria ',priority:'0'}),{title:' title ',description:' ',categoryId:null,projectId:null,priority:0,dueDate:null,completionCriteria:' criteria ',subtasks:[]})
})
test('subtask payload drops blank rows and client IDs and reindexes remaining rows', () => {
 const subtasks = [
  {id:'existing',clientId:'existing',title:' kept ',completed:true},
  {id:'blank',clientId:'blank',title:' \n ',completed:false},
  {clientId:'new-local',title:'new',completed:false},
 ]
 assert.deepEqual(todoMutationInput({...emptyDraft,subtasks}).subtasks,[
  {id:'existing',title:' kept ',completed:true,sortOrder:0},
  {title:'new',completed:false,sortOrder:1},
 ])
 assert.equal(subtasks.length,3)
 assert.equal(subtasks[0].title,' kept ')
})
test('due date uses local calendar day and saves local noon through DST offsets', () => {
 const previous = process.env.TZ
 try {
  for (const [tz,day,iso] of [['UTC','2026-10-04','2026-10-04T12:00:00.000Z'],['Asia/Shanghai','2026-10-04','2026-10-04T04:00:00.000Z'],['America/New_York','2026-10-03','2026-10-04T16:00:00.000Z']]) {
   process.env.TZ=tz
   assert.equal(dueDateInput('2026-10-04T00:15:00Z'),day)
   assert.equal(todoMutationInput({...emptyDraft,dueDate:'2026-10-04'}).dueDate,iso)
  }
  process.env.TZ='America/New_York'
  assert.equal(todoMutationInput({...emptyDraft,dueDate:'2026-11-01'}).dueDate,'2026-11-01T17:00:00.000Z')
 } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ=previous }
 assert.equal(dueDateInput(null),'')
 assert.throws(()=>dueDateInput('invalid'),RangeError)
 assert.throws(()=>todoMutationInput({...emptyDraft,dueDate:'invalid'}),RangeError)
})
test('Todo query searches every displayed text source case-insensitively and trims only query', () => {
 for (const field of ['title','description','completionCriteria','project','subtasks']) {
  const value = field==='project' ? {title:'Needle'} : field==='subtasks' ? [{title:'Needle'}] : 'Needle'
  const todo = item({[field]:value})
  assert.deepEqual(filterTodos([todo],null,'ALL','  NEEDLE  '),[todo])
 }
 assert.deepEqual(filterTodos([item()],null,'ALL','missing'),[])
 assert.deepEqual(filterTodos([item()],null,'ALL',' \n '),[item()])
})
test('Todo category and status filters intersect without filtering uncategorized all view', () => {
 const todos=[item({id:'a',categoryId:'a'}),item({id:'b',categoryId:'b',status:'DONE'}),item({id:'none'})]
 assert.deepEqual(filterTodos(todos,'b','TODO',''),[])
 assert.deepEqual(filterTodos(todos,'b','DONE','').map(x=>x.id),['b'])
 assert.deepEqual(filterTodos(todos,null,'TODO','').map(x=>x.id),['a','none'])
 assert.equal(filterTodos(todos,'','ALL','').length,3)
})
test('Todo order is TODO first then descending priority with null last then newest; ties stay stable', () => {
 const todos = [item({id:'done',status:'DONE',priority:2}),item({id:'null'}),item({id:'zero',priority:0}),item({id:'high-old',priority:2}),item({id:'high-new',priority:2,createdAt:'2026-10-02T00:00:00Z'}),item({id:'high-tie',priority:2})]
 const before = todos.map(x=>x.id)
 assert.deepEqual(filterTodos(todos,null,'ALL','').map(x=>x.id),['high-new','high-old','high-tie','zero','null','done'])
 assert.deepEqual(todos.map(x=>x.id),before)
 assert.notEqual(filterTodos(todos,null,'ALL',''),todos)
})
