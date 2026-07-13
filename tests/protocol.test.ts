import { describe, expect, it } from 'vitest';
import { parseMessage } from '../src/shared/protocol';

describe('parseMessage', () => {
  it('解析合法 hello（host / controller）', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', role: 'host' }))).toEqual({
      type: 'hello',
      role: 'host',
    });
    expect(
      parseMessage(JSON.stringify({ type: 'hello', role: 'controller' })),
    ).toEqual({ type: 'hello', role: 'controller' });
  });

  it('拒絕未知 role 的 hello', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', role: 'admin' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'hello' }))).toBeNull();
  });

  it('解析合法 orient', () => {
    const raw = JSON.stringify({ type: 'orient', q: [0, 0, 0, 1], t: 123.4 });
    expect(parseMessage(raw)).toEqual({ type: 'orient', q: [0, 0, 0, 1], t: 123.4 });
  });

  it('拒絕格式不符的 orient', () => {
    expect(parseMessage(JSON.stringify({ type: 'orient', q: [0, 0, 1], t: 1 }))).toBeNull(); // 長度 3
    expect(
      parseMessage(JSON.stringify({ type: 'orient', q: [0, 0, 0, 'x'], t: 1 })),
    ).toBeNull(); // 非數字
    expect(
      parseMessage(JSON.stringify({ type: 'orient', q: [0, 0, 0, null], t: 1 })),
    ).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'orient', q: [0, 0, 0, 1] }))).toBeNull(); // 缺 t
    expect(parseMessage('{"type":"orient","q":[0,0,0,1e999],"t":1}')).toBeNull(); // Infinity
  });

  it('解析合法 btn 並拒絕未知 id', () => {
    expect(
      parseMessage(JSON.stringify({ type: 'btn', id: 'action', pressed: true })),
    ).toEqual({ type: 'btn', id: 'action', pressed: true });
    expect(
      parseMessage(JSON.stringify({ type: 'btn', id: 'other', pressed: true })),
    ).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'btn', id: 'action' }))).toBeNull();
  });

  it('解析 status 與 kick', () => {
    expect(parseMessage(JSON.stringify({ type: 'status', controller: true }))).toEqual({
      type: 'status',
      controller: true,
    });
    expect(parseMessage(JSON.stringify({ type: 'status' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'kick' }))).toEqual({ type: 'kick' });
    expect(parseMessage(JSON.stringify({ type: 'ready' }))).toEqual({ type: 'ready' });
  });

  it('只接受已知的手機音效 cue', () => {
    expect(parseMessage(JSON.stringify({ type: 'cue', id: 'ambience-start' }))).toEqual({
      type: 'cue',
      id: 'ambience-start',
    });
    expect(parseMessage(JSON.stringify({ type: 'cue', id: 'ambience-stop' }))).toEqual({
      type: 'cue',
      id: 'ambience-stop',
    });
    expect(parseMessage(JSON.stringify({ type: 'cue', id: 'ring' }))).toEqual({
      type: 'cue',
      id: 'ring',
    });
    expect(parseMessage(JSON.stringify({ type: 'cue', id: 'jumpscare' }))).toEqual({
      type: 'cue',
      id: 'jumpscare',
    });
    expect(parseMessage(JSON.stringify({ type: 'cue', id: 'unknown' }))).toBeNull();
  });

  it('解析劇情畫面與手機劇情操作', () => {
    expect(parseMessage(JSON.stringify({ type: 'story', screen: 'incoming-407' }))).toEqual({
      type: 'story',
      screen: 'incoming-407',
    });
    expect(parseMessage(JSON.stringify({ type: 'story-action', id: 'answer' }))).toEqual({
      type: 'story-action',
      id: 'answer',
    });
    expect(
      parseMessage(JSON.stringify({ type: 'story-action', id: 'digit', value: '7' })),
    ).toEqual({ type: 'story-action', id: 'digit', value: '7' });
    expect(parseMessage(JSON.stringify({ type: 'story', screen: 'not-a-scene' }))).toBeNull();
    expect(
      parseMessage(JSON.stringify({ type: 'story-action', id: 'digit', value: '31' })),
    ).toBeNull();
  });

  it('拒絕非字串、壞 JSON、未知 type', () => {
    expect(parseMessage(42)).toBeNull();
    expect(parseMessage(new ArrayBuffer(4))).toBeNull();
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage('null')).toBeNull();
    expect(parseMessage('"just a string"')).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
  });
});
