import { afterEach, expect, it, vi } from 'vitest';
import { installPainterProducerProfile, PainterProducerProfile, profilePainterProducer } from './painter-producer-profile.js';

let installed: ReturnType<typeof installPainterProducerProfile> | null = null;
afterEach(() => { installed?.dispose(); installed = null; vi.restoreAllMocks(); });

it('does no clock work when disabled and preserves producer return values', () => {
  const clock = vi.spyOn(performance, 'now');
  const build = profilePainterProducer('setup', (value: number) => value + 1);
  expect(build(8)).toBe(9);
  expect(clock).not.toHaveBeenCalled();
});

it('records only completed sampled frames and clears skipped producers between frames', () => {
  const clock = vi.spyOn(performance, 'now');
  clock.mockReturnValueOnce(10).mockReturnValueOnce(11)
    .mockReturnValueOnce(12).mockReturnValueOnce(16)
    .mockReturnValueOnce(20).mockReturnValueOnce(22);
  const setup = profilePainterProducer('setup', () => 42);
  const resources = profilePainterProducer('resources', () => {});
  installed = installPainterProducerProfile();
  expect(setup(undefined)).toBe(42); resources(undefined); installed.record();
  setup(undefined); installed.record();
  const report = installed.report();
  expect(report.frames).toBe(2);
  expect(report.producers.find(({ id }) => id === 'setup')).toMatchObject({ count: 2, mean: 1.5, p95: 2 });
  expect(report.producers.find(({ id }) => id === 'resources')).toMatchObject({ count: 2, mean: 2, p95: 4 });
  expect(() => installed!.record()).toThrow('frame_not_started');
});

it('preserves exceptions and restores the disabled path after disposal', () => {
  const failure = new Error('producer failed');
  const build = profilePainterProducer('setup', () => { throw failure; });
  installed = installPainterProducerProfile();
  expect(() => installPainterProducerProfile()).toThrow('already_installed');
  expect(build).toThrow(failure);
  installed.dispose();
  const clock = vi.spyOn(performance, 'now');
  expect(build).toThrow(failure);
  expect(clock).not.toHaveBeenCalled();
});

it('rejects overflow rather than silently dropping frames', () => {
  const profile = new PainterProducerProfile(1);
  expect(() => profile.record()).toThrow('frame_not_started');
  profile.begin(); profile.add(0, 3); profile.record();
  profile.begin();
  expect(() => profile.record()).toThrow('overflow');
  expect(() => new PainterProducerProfile(0)).toThrow(RangeError);
});
