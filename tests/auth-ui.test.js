import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthFlow, validateAuth, authErrorMessage } from '../auth-ui.js';

test('sign-in failure restores submission and preserves email for retry and switching views', () => {
  const flow=new AuthFlow();
  const first=flow.begin('  druid@example.com  ');
  assert.equal(flow.busy,true);
  assert.equal(flow.begin('duplicate@example.com'),null);
  assert.equal(flow.email,'druid@example.com');
  assert.equal(flow.fail(first,{code:'invalid_credentials'}),true);
  assert.equal(flow.busy,false);
  assert.match(flow.error,/email or password is incorrect/);
  flow.change('forgot');
  assert.equal(flow.email,'druid@example.com');
  assert.equal(flow.error,'');
  flow.change('signup');
  assert.equal(flow.email,'druid@example.com');
  const retry=flow.begin(flow.email);
  assert.ok(retry);
  assert.equal(flow.active(first),false);
});

test('closing any pending auth view invalidates late completion and error feedback', () => {
  for(const view of ['signin','signup','forgot']){
    const flow=new AuthFlow();flow.change(view,'druid@example.com');
    const request=flow.begin(flow.email);
    flow.close();
    assert.equal(flow.view,'signin');
    assert.equal(flow.busy,false);
    assert.equal(flow.sent(request),false);
    assert.equal(flow.fail(request,Error('network failed')),false);
    assert.equal(flow.finish(request),false);
    assert.equal(flow.email,'druid@example.com');
    assert.equal(flow.error,'');
  }
});

test('changing modes invalidates an older request without erasing the new view', () => {
  const flow=new AuthFlow();const request=flow.begin('first@example.com');
  flow.change('signup','second@example.com');
  assert.equal(flow.fail(request,{code:'invalid_credentials'}),false);
  assert.equal(flow.sent(request),false);
  assert.equal(flow.view,'signup');
  assert.equal(flow.email,'second@example.com');
});

test('signup confirmation and reset confirmation remember their distinct next steps', () => {
  for(const view of ['signup','forgot']){
    const flow=new AuthFlow();flow.change(view,'druid@example.com');
    const request=flow.begin(flow.email);
    assert.equal(flow.sent(request),true);
    assert.equal(flow.view,'sent');
    assert.equal(flow.sentFor,view);
    assert.equal(flow.busy,false);
    flow.change('signin');
    assert.equal(flow.email,'druid@example.com');
    assert.equal(flow.sentFor,null);
  }
});

test('validation accommodates existing passwords but requires eight characters for new passwords', () => {
  assert.deepEqual(validateAuth('signin',{email:'druid@example.com',password:'short'}),{});
  assert.match(validateAuth('signup',{email:'druid@example.com',password:'short'}).password,/8/);
  assert.deepEqual(validateAuth('forgot',{email:'druid@example.com'}),{});
  assert.deepEqual(validateAuth('password',{password:'password123',confirm:'password123'}),{});
  assert.equal(validateAuth('password',{password:'password123',confirm:'other'}).confirm,'Passwords do not match.');
  assert.match(validateAuth('signin',{email:'not-an-email',password:'password123'}).email,/valid email/);
});

test('common auth failures have helpful messages and never expose backend details', () => {
  assert.match(authErrorMessage({code:'email_not_confirmed'}),/Confirm your email/);
  assert.match(authErrorMessage({status:429}),/wait a few minutes/);
  assert.match(authErrorMessage({message:'Failed to fetch'}),/Check your connection/);
  assert.match(authErrorMessage({code:'email_address_not_authorized',message:'SMTP only allows project team'}),/couldn’t send the email/);
  assert.match(authErrorMessage({code:'flow_state_expired'},'password'),/no longer valid/);
  const raw='database exploded at https://internal.example/config-secret';
  assert.equal(authErrorMessage({message:raw},'signup'),'We couldn’t create your account. Please try again.');
  assert.equal(authErrorMessage({message:raw},'forgot'),'We couldn’t send a reset link. Please try again in a few minutes.');
});

test('network failure can be retried and successful completion clears the pending state', () => {
  const flow=new AuthFlow();const first=flow.begin('druid@example.com');
  flow.fail(first,{name:'AuthRetryableFetchError'});
  const retry=flow.begin(flow.email);
  assert.equal(flow.error,'');
  assert.equal(flow.finish(retry),true);
  assert.equal(flow.busy,false);
  assert.equal(flow.finish(retry),false);
});
