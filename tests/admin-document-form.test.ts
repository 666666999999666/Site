import assert from 'node:assert/strict'
import test from 'node:test'
import { draftFromPost, postMutationInput } from "../components/admin/post-form"
import { draftFromIdea, ideaDraftTags, ideaMutationInput } from "../components/admin/idea-form"

// Expectations were first run against the original PostForm/IdeaForm bodies before extraction.
function postSource(overrides: Record<string, unknown>) {
 return { title: '', content: '', excerpt: null, contentFormat: null, readHint: null,
  categoryId: null, seriesId: null, seriesOrder: null, tags: [], publishedAt: null,
  ...overrides } as NonNullable<Parameters<typeof draftFromPost>[0]>
}
const emptyPost = { title: '', content: '', excerpt: '', contentFormat: '', readHint: '', categoryId: '', seriesId: '', seriesOrder: '', tags: '', publishedAt: '' }
const emptyIdea = {title: '', content: '', tags: '', projectIds: []}

test('new drafts initialize every field and preserve persisted text', () => {
 assert.deepEqual(draftFromPost(), emptyPost)
 assert.deepEqual(draftFromIdea(), {...emptyIdea, discussionStatus:"STORED", discussionSummary:""})
 const projects = [{id:'z'}, {id:'a'}]
 assert.deepEqual(draftFromIdea({title:' raw ',content:'<p>old</p>',tags:['x','y'],projects}), {title:' raw ',content:'<p>old</p>',tags:'x, y',projectIds:['a','z'],discussionStatus:'STORED',discussionSummary:''})
 assert.deepEqual(projects, [{id:'z'}, {id:'a'}])
 assert.deepEqual(draftFromPost(postSource({title:' raw ', content:'<p>old</p>', tags:['a','b'],seriesOrder:0})), {...emptyPost,title:' raw ',content:'<p>old</p>',tags:'a, b',seriesOrder:'0'})
})
test('datetime input uses local wall clock and drops seconds, not UTC wall clock', () => {
 const previous = process.env.TZ
 try {
  for (const [tz, expected] of [['UTC','2026-10-04T00:15'],['Asia/Shanghai','2026-10-04T08:15'],['America/New_York','2026-10-03T20:15']]) {
   process.env.TZ = tz
   assert.equal(draftFromPost(postSource({publishedAt:'2026-10-04T00:15:59Z'})).publishedAt, expected)
   assert.equal(draftFromPost(postSource({publishedAt:new Date('2026-10-04T00:15:59Z')})).publishedAt, expected)
  }
 } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ=previous }
})
test('post create sends complete nullable fields and normalized tags without trimming body/title', () => {
 const current = {...emptyPost,title:' title ',content:'<p>legacy</p>',tags:'x, x，Map<A,B>'}
 assert.deepEqual(postMutationInput(current, emptyPost, false, 'DRAFT'), {title:' title ',content:'<p>legacy</p>',excerpt:'',contentFormat:null,readHint:null,categoryId:null,seriesId:null,seriesOrder:null,tags:['x','Map<A,B>'],publishedAt:null,status:'DRAFT'})
})
test('unchanged post patch contains only status and optional review token', () => {
 const current = {...emptyPost,content:'<p>legacy unchanged</p>'}
 assert.deepEqual(postMutationInput(current,current,true,'PUBLISHED'),{status:'PUBLISHED'})
 assert.deepEqual(postMutationInput(current,current,true,'PUBLISHED','review'),{status:'PUBLISHED',publicationReviewToken:'review'})
 assert.deepEqual(postMutationInput(current,current,true,'PUBLISHED',''),{status:'PUBLISHED'})
})
test('metadata edits omit legacy content; explicit content deletion is retained', () => {
 const baseline = {...emptyPost,title:'old',content:'<p>old</p>'}
 assert.deepEqual(postMutationInput({...baseline,title:'new'},baseline,true,'DRAFT'),{status:'DRAFT',title:'new'})
 assert.deepEqual(postMutationInput({...baseline,content:''},baseline,true,'DRAFT'),{status:'DRAFT',content:''})
})
test('series changes force order into patches even when its draft value is unchanged', () => {
 const baseline = {...emptyPost,seriesId:'old',seriesOrder:'7'}
 assert.deepEqual(postMutationInput({...baseline,seriesId:'new'},baseline,true,'DRAFT'),{status:'DRAFT',seriesId:'new',seriesOrder:7})
 assert.deepEqual(postMutationInput({...baseline,seriesId:''},baseline,true,'DRAFT'),{status:'DRAFT',seriesId:null,seriesOrder:null})
 assert.deepEqual(postMutationInput({...baseline,seriesOrder:' '},baseline,true,'DRAFT'),{status:'DRAFT',seriesOrder:null})
 assert.deepEqual(postMutationInput({...baseline,seriesOrder:'1e2'},baseline,true,'DRAFT'),{status:'DRAFT',seriesOrder:100})
 assert.deepEqual(postMutationInput({...baseline,seriesOrder:'bad'},baseline,true,'DRAFT'), {status:'DRAFT',seriesOrder:NaN})
})
test('clear optional fields maps empty string to null without trimming nonempty values', () => {
 const baseline = {...emptyPost,contentFormat:'article',readHint:'hint',categoryId:'cat',publishedAt:'2026-10-04T00:00'}
 assert.deepEqual(postMutationInput({...baseline,contentFormat:'',readHint:'',categoryId:'',publishedAt:''},baseline,true,'DRAFT'),{status:'DRAFT',contentFormat:null,readHint:null,categoryId:null,publishedAt:null})
 assert.deepEqual(postMutationInput({...emptyPost,readHint:'  '},emptyPost,true,'DRAFT'),{status:'DRAFT',readHint:'  '})
})
test('publication date validation precedes patch filtering and serializes timezone offsets', () => {
 assert.deepEqual(postMutationInput({...emptyPost,publishedAt:'2026-10-04T08:00+08:00'},emptyPost,true,'PUBLISHED'),{status:'PUBLISHED',publishedAt:'2026-10-04T00:00:00.000Z'})
 const invalid = {...emptyPost,publishedAt:'invalid'}
 assert.throws(()=>postMutationInput(invalid,invalid,true,'DRAFT'),{message:'发布时间无效'})
})
test('Idea tags intentionally split only ASCII commas and preserve duplicates', () => {
 assert.deepEqual(ideaDraftTags(' a, a,中，文,, '), ['a','a','中，文'])
 assert.deepEqual(ideaMutationInput({...emptyIdea,title:' raw ',content:'  body ',tags:' a, a,中，文,, '},emptyIdea,false),{title:' raw ',content:'  body ',tags:['a','a','中，文'],projectIds:[]})
})
test('Idea patches compare raw draft values and project contents rather than array identity', () => {
 const baseline = {...emptyIdea,title:'title',tags:'a',projectIds:['a','z']}
 assert.deepEqual(ideaMutationInput({...baseline,projectIds:['a','z']},baseline,true),{})
 assert.deepEqual(ideaMutationInput({...baseline,tags:' a '},baseline,true),{tags:['a']})
 assert.deepEqual(ideaMutationInput({...baseline,projectIds:['z','a']},baseline,true),{projectIds:['z','a']})
 assert.deepEqual(ideaMutationInput({...baseline,content:'new'},baseline,true),{content:'new'})
 assert.deepEqual(ideaMutationInput({...baseline,projectIds:[]},baseline,true),{projectIds:[]})
})
test('payload construction does not mutate drafts or baseline', () => {
 const current = Object.freeze({...emptyPost,title:'new',seriesId:'s',seriesOrder:'2'})
 const baseline = Object.freeze({...emptyPost})
 postMutationInput(current,baseline,true,'PUBLISHED','review')
 const idea = {...emptyIdea,projectIds:['p']}
 Object.freeze(idea.projectIds)
 Object.freeze(idea)
 ideaMutationInput(idea,Object.freeze({...emptyIdea}),true)
})

test('material interpretation mutations never send immutable raw provenance', () => {
 const baseline = draftFromIdea({title:'title',content:'body',tags:[],projects:[],discussionStatus:'WANT_DISCUSS',discussionSummary:'resume here'})
 assert.deepEqual(ideaMutationInput({...baseline,discussionStatus:'ARCHIVED'},baseline,true), {discussionStatus:'ARCHIVED'})
 assert.deepEqual(ideaMutationInput({...baseline,discussionSummary:''},baseline,true), {discussionSummary:null})
 assert.equal('rawInput' in ideaMutationInput(baseline, baseline, false), false)
})
