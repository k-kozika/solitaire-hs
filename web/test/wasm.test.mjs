import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as api from '../src/generated/solitaire/solitaire.js'
import { loadEngine } from '../src/engine.ts'
import { advanceSession, createSession, MAX_SEED, undoSession } from '../src/game.ts'

const unwrap = result => { if ('Left' in result) throw new Error(result.Left); return result.Right }
const engine = await loadEngine()

test('all six games preserve deterministic seeds and accept enumerated legal actions', () => {
  assert.equal(engine.games().length, 6)
  for (const [id, name] of engine.games()) {
    for (const seed of [0n, 42n, MAX_SEED]) {
      let session = createSession(engine, id, name, seed, 1)
      const initialBoard = session.board
      assert.deepEqual(session.board, engine.newGame(id, seed))
      for (let step = 0; step < 8 && session.actions.length; step++) {
        session = advanceSession(engine, session, session.actions[step % session.actions.length])
        assert.equal(session.turns, step + 1)
        assert.equal([...session.board.values()].flat().length, id === 'spider' ? 104 : 52)
      }
      while (session.history.length) session = undoSession(engine, session)
      assert.deepEqual(session.board, initialBoard)
      assert.deepEqual(session.actions, engine.legalActions(id, initialBoard))
      assert.equal(session.turns, 0)
    }
  }
  assert.throws(() => engine.newGame('klondike', MAX_SEED + 1n))
})

test('Klondike seed 7 has a legal winning hint path within the default budget', () => {
  let session = createSession(engine, 'klondike', 'Klondike', 7n, 1)
  const result = unwrap(api.solve(3500, session.gameId, session.board))
  assert.equal(result.$tag, 'Solved')
  assert.ok(result.contents.length > 0)
  for (const action of result.contents) session = advanceSession(engine, session, action)
  assert.ok(session.finishedAt !== null)
  assert.equal(engine.won(session.gameId, session.board), true)
  assert.equal(session.turns, result.contents.length)
  const undone = undoSession(engine, session)
  assert.equal(undone.finishedAt, null)
  assert.equal(engine.won(undone.gameId, undone.board), false)
  assert.ok(undone.revision > session.revision)
  session = advanceSession(engine, undone, result.contents.at(-1))
  assert.equal(engine.won(session.gameId, session.board), true)
  while (session.history.length) session = undoSession(engine, session)
  assert.deepEqual(session.board, engine.newGame('klondike', 7n))
  assert.equal(session.turns, 0)
})
