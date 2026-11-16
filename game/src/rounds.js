// Rounds and money: a match is first to 5 round wins. Each round opens
// with a 15 s buy phase (frozen, buy menu open), then 100 s live, then a
// 5 s banner. Win pays $3250, a loss pays $1400 plus $500 per consecutive
// loss, and every kill pays $300. The player's wallet persists across
// rounds; weapons and armor do too, until the round ends — kept, like the
// real thing, because a player who survives keeps their kit.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const OVER_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const WIN_BONUS = 3250;
export const LOSS_BASE = 1400;
export const LOSS_STEP = 500;
export const KILL_BONUS = 300;
export const START_MONEY = 800;

export function createRounds() {
  const state = {
    phase: 'buy', // buy | live | over | match
    phaseTime: BUY_SECONDS,
    round: 1,
    wins: { vipers: 0, jackals: 0 },
    money: START_MONEY,
    lossStreak: 0,
    lastResult: null, // { winner, reason }
    matchWinner: null,
  };

  return {
    state,
    startRound() {
      state.phase = 'buy';
      state.phaseTime = BUY_SECONDS;
      state.lastResult = null;
    },
    startLive() {
      state.phase = 'live';
      state.phaseTime = ROUND_SECONDS;
    },
    // Ticks the phase clock. Returns 'buyEnd' | 'timeUp' | 'overEnd' | null.
    step(dt) {
      if (state.phase === 'match') return null;
      state.phaseTime -= dt;
      if (state.phaseTime > 0) return null;
      if (state.phase === 'buy') {
        this.startLive();
        return 'buyEnd';
      }
      if (state.phase === 'live') return 'timeUp';
      if (state.phase === 'over') return 'overEnd';
      return null;
    },
    endRound(winner, reason) {
      state.wins[winner] += 1;
      const playerWon = winner === 'vipers';
      if (playerWon) {
        state.money += WIN_BONUS;
        state.lossStreak = 0;
      } else {
        state.money += LOSS_BASE + LOSS_STEP * Math.min(4, state.lossStreak);
        state.lossStreak += 1;
      }
      state.money = Math.min(16000, state.money);
      state.lastResult = { winner, reason };
      state.phase = 'over';
      state.phaseTime = OVER_SECONDS;
      if (state.wins[winner] >= WIN_ROUNDS) state.matchWinner = winner;
    },
    payKill() {
      state.money = Math.min(16000, state.money + KILL_BONUS);
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    nextRound() {
      state.round += 1;
      this.startRound();
    },
    endMatch() {
      state.phase = 'match';
    },
  };
}
