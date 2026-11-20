import { describe, expect, test } from 'bun:test'
import {
  MAX_SEED, advanceSession, canSelect, classifyResult, createSession, describeAction,
  elapsedSeconds, entriesFor, formatTime, moveTo, parseSeed, sameAction, undoSession,
} from '../src/game'
import type { Action, Board, Engine, Entry, Pile } from '../src/game'

const pile = (group: Pile['contents'][0], number: number): Pile => ({ $tag: 'Pile', contents: [group, number] })
const card = (rank: 'Ace' | 'Two', suit: 'Hearts' | 'Spades', face: 'Up' | 'Down' = 'Up'): Entry =>
  ({ $tag: 'Entry', contents: [face, { $tag: 'Card', rank, suit }] })
const source = pile('Tableau', 1)
const target = pile('Foundation', 1)
const move: Action = { $tag: 'Move', contents: [1, source, target] }
const draw: Action = { $tag: 'Draw' }
const board: Board = new Map([[source, [card('Ace', 'Hearts')]], [target, []]])

function engineFor(actions: Action[] = [move], winning = true): Engine {
  return {
    games: () => [['klondike', 'Klondike']], newGame: () => board,
    legalActions: () => actions,
    applyAction: () => new Map([[source, []], [target, [card('Ace', 'Hearts')]]]),
    won: (_, current) => winning && entriesFor(current, target).length > 0,
  }
}

describe('deal seeds', () => {
  test('preserves zero and all 64 bits without floating point', () => {
    expect(parseSeed('0')).toBe(0n)
    expect(parseSeed(' 18446744073709551615 ')).toBe(MAX_SEED)
    expect(parseSeed('9007199254740993')).toBe(9007199254740993n)
    expect(parseSeed('  ')).toBeNull()
  })
  test('rejects overflow, negatives and non-decimal input', () => {
    for (const text of ['18446744073709551616', '-1', '1.5', '1e3', '0xff', '+3', 'hello']) {
      expect(() => parseSeed(text)).toThrow()
    }
  })
})

describe('legal selection', () => {
  test('compares structurally cloned piles and actions', () => {
    const clone = structuredClone(move)
    expect(sameAction(move, clone)).toBe(true)
    expect(canSelect([move], pile('Tableau', 1), 1)).toBe(true)
    expect(entriesFor(board, pile('Tableau', 1))).toEqual([card('Ace', 'Hearts')])
    expect(moveTo([move], { pile: pile('Tableau', 1), count: 1 }, pile('Foundation', 1))).toBe(move)
  })
  test('only selects exact legal prefixes and destinations', () => {
    const run: Action = { $tag: 'Move', contents: [3, source, pile('Tableau', 2)] }
    expect(canSelect([run], source, 3)).toBe(true)
    expect(canSelect([run], source, 2)).toBe(false)
    expect(canSelect([draw], source, 1)).toBe(false)
    expect(moveTo([run], { pile: source, count: 3 }, target)).toBeUndefined()
    expect(sameAction(move, draw)).toBe(false)
  })
  test('hints never expose the identity of a face-down card', () => {
    const hidden = new Map([[source, [card('Ace', 'Hearts', 'Down')]]])
    expect(describeAction(hidden, move)).not.toContain('Hearts')
    expect(describeAction(board, move)).toContain('Ace of Hearts')
  })
})

describe('session accounting', () => {
  test('commits winning moves once and freezes elapsed time', () => {
    const engine = engineFor()
    const initial = createSession(engine, 'klondike', 'Klondike', MAX_SEED, 7, 1000)
    const final = advanceSession(engine, initial, structuredClone(move), 62000)
    expect(initial.turns).toBe(0)
    expect(initial.history).toEqual([])
    expect(initial.finishedAt).toBeNull()
    expect(final.turns).toBe(1)
    expect(final.revision).toBe(8)
    expect(final.finishedAt).toBe(62000)
    expect(final.actions).toEqual([])
    expect(elapsedSeconds(final, 999999)).toBe(61)
    expect(formatTime(elapsedSeconds(final))).toBe('01:01')
    expect(() => advanceSession(engine, final, move)).toThrow()
  })
  test('draws count as one move and illegal moves do not commit', () => {
    const engine = engineFor([draw], false)
    const initial = createSession(engine, 'golf', 'Golf', 0n, 1, 1000)
    expect(() => advanceSession(engine, initial, move)).toThrow()
    expect(initial.turns).toBe(0)
    const next = advanceSession(engine, initial, draw, 5000)
    expect(next.turns).toBe(1)
    expect(elapsedSeconds(next, 6000)).toBe(5)
  })
  test('engine errors preserve the original session', () => {
    const engine = engineFor()
    const initial = createSession(engine, 'klondike', 'Klondike', 0n, 1, 1000)
    engine.applyAction = () => { throw new Error('Rejected') }
    expect(() => advanceSession(engine, initial, move)).toThrow('Rejected')
    expect(initial.board).toBe(board)
    expect(initial.turns).toBe(0)
  })
})

describe('undo', () => {
  test('does nothing before the first move and each fresh deal has empty history', () => {
    const engine = engineFor()
    const initial = createSession(engine, 'klondike', 'Klondike', 7n, 1, 1000)
    expect(undoSession(engine, initial)).toBe(initial)
    const moved = advanceSession(engine, initial, move, 2000)
    const fresh = createSession(engine, 'klondike', 'Klondike', 8n, moved.revision + 1, 3000)
    expect(fresh.history).toEqual([])
    expect(fresh.turns).toBe(0)
  })
  test('restores a winning move, legal actions and timer while advancing the revision', () => {
    const engine = engineFor()
    const initial = createSession(engine, 'klondike', 'Klondike', MAX_SEED, 1, 1000)
    const won = advanceSession(engine, initial, move, 2000)
    const undone = undoSession(engine, won)
    expect(undone.board).toBe(initial.board)
    expect(undone.actions).toEqual(initial.actions)
    expect(undone.turns).toBe(0)
    expect(undone.finishedAt).toBeNull()
    expect(undone.revision).toBe(won.revision + 1)
    expect(undone.seed).toBe(MAX_SEED)
    expect(undone.startedAt).toBe(1000)
    expect(elapsedSeconds(undone, 5000)).toBe(4)
    expect(advanceSession(engine, undone, move, 6000).finishedAt).toBe(6000)
  })
  test('undoes successive stock actions back to the initial deal and allows a new branch', () => {
    const engine = engineFor([draw], false)
    const initial = createSession(engine, 'golf', 'Golf', 7n, 1)
    const first = advanceSession(engine, initial, draw)
    const second = advanceSession(engine, first, draw)
    const once = undoSession(engine, second)
    expect(once.board).toBe(first.board)
    expect(once.turns).toBe(1)
    const branch = advanceSession(engine, once, draw)
    expect(branch.history.length).toBe(2)
    const start = undoSession(engine, undoSession(engine, branch))
    expect(start.board).toBe(initial.board)
    expect(start.history).toEqual([])
    expect(start.turns).toBe(0)
    expect(start.revision).toBeGreaterThan(second.revision)
    expect(undoSession(engine, start)).toBe(start)
  })
  test('restores automatic reveals exactly and failed actions add no history', () => {
    const engine = engineFor([move], false)
    const hiddenBoard: Board = new Map([[source, [card('Ace', 'Hearts'), card('Two', 'Spades', 'Down')]], [target, []]])
    engine.newGame = () => hiddenBoard
    engine.applyAction = () => new Map([[source, [card('Two', 'Spades')]], [target, [card('Ace', 'Hearts')]]])
    const initial = createSession(engine, 'klondike', 'Klondike', 7n, 1)
    const moved = advanceSession(engine, initial, move)
    expect(entriesFor(moved.board, source)[0].contents[0]).toBe('Up')
    expect(undoSession(engine, moved).board).toBe(hiddenBoard)
    expect(entriesFor(undoSession(engine, moved).board, source)[1].contents[0]).toBe('Down')
    engine.applyAction = () => { throw new Error('Rejected') }
    expect(() => advanceSession(engine, moved, move)).toThrow()
    expect(moved.history.length).toBe(1)
  })
})

test('only exhaustive failure means no winning path', () => {
  expect(classifyResult({ $tag: 'Exhausted' })).toEqual({ status: 'impossible' })
  expect(classifyResult({ $tag: 'LimitReached' }).status).toBe('unknown')
  expect(classifyResult({ $tag: 'Solved', contents: [move] })).toEqual({ status: 'solved', path: [move] })
})
