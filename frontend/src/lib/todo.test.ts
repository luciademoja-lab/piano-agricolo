import { describe, it, expect } from 'vitest';
import { EMPTY_TODO, checkTodo, daysBetween, todoGroups, type Todo } from './todo';

const t = (o: Partial<Todo>): Todo => ({
  id: Math.random().toString(36), title: 'x', status: 'da_fare', who: null, due: null, waitingSince: null, note: null, link: null, doneAt: null, createdAt: 1, ...o,
});

describe('the to-do list', () => {
  it('checks what is written', () => {
    expect(checkTodo({ ...EMPTY_TODO, title: 'Chiamare il CAA' })).toBeNull();
    expect(checkTodo(EMPTY_TODO)).toBe("Scrivi cosa c'è da fare.");
    expect(checkTodo({ ...EMPTY_TODO, title: 'x', link: 'www.gmail.com' })).toMatch(/http/);
    expect(checkTodo({ ...EMPTY_TODO, title: 'x', due: '17/11/2026' })).toBe('Data non valida.');
  });
  it('counts the days', () => {
    expect(daysBetween('2026-11-03', '2026-11-11')).toBe(8);
    expect(daysBetween('2026-11-11', '2026-11-11')).toBe(0);
    expect(daysBetween('2026-11-11', '2026-11-10')).toBe(-1);
  });
  it('orders each list: first due, longest waiting, last done', () => {
    const g = todoGroups([
      t({ id: 'a', due: '2026-12-23' }), t({ id: 'b', due: '2026-11-17' }), t({ id: 'c' }),
      t({ id: 'w1', status: 'in_attesa', waitingSince: '2026-11-11' }), t({ id: 'w2', status: 'in_attesa', waitingSince: '2026-11-03' }),
      t({ id: 'd1', status: 'fatto', doneAt: 5 }), t({ id: 'd2', status: 'fatto', doneAt: 9 }),
    ]);
    expect(g.da_fare.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(g.in_attesa.map((x) => x.id)).toEqual(['w2', 'w1']);
    expect(g.fatto.map((x) => x.id)).toEqual(['d2', 'd1']);
  });
});
