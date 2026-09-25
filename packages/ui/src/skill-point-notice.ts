import type { ProgressionContentDefinition } from '@orchard/sim';
import type { SkillTrack } from '@orchard/sim';
import { isSkillTrack, skillLevelForExperience } from '@orchard/sim/skill-trees';

export interface SkillPointProgress {
  readonly track: string;
  readonly experience: bigint;
  readonly bonusPoints: number;
}

export interface SkillPointNotice {
  readonly track: SkillTrack;
  readonly points: number;
}

/** Detects newly earned points without treating initial subscription hydration
 * or a respec (which changes only spent points) as a new-point event. */
export class SkillPointNoticeTracker {
  private readonly earnedByTrack = new Map<SkillTrack, number>();

  reset(): void {
    this.earnedByTrack.clear();
  }

  observe(rows: Iterable<SkillPointProgress>, progression?: ProgressionContentDefinition): readonly SkillPointNotice[] {
    const notices: SkillPointNotice[] = [];
    for (const row of rows) {
      if (!isSkillTrack(row.track)) continue;
      const earned = skillLevelForExperience(row.experience, progression) + Math.max(0, row.bonusPoints);
      const previous = this.earnedByTrack.get(row.track);
      this.earnedByTrack.set(row.track, earned);
      if (previous !== undefined && earned > previous) {
        notices.push({ track: row.track, points: earned - previous });
      }
    }
    return notices;
  }
}
