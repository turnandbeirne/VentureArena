import { useCallback, useState } from 'react';
import { ASSETS, BUSINESS_UPGRADE_TRACKS, WEATHER_STAGES, getAssetIncomeRange, getBotPersonality, getSkillLevel } from '../../data/gameConfig';
import {
  assetValue,
  businessValue,
  netWorth,
  passiveIncome,
  avgPurchasePrice,
  perUnitIncome,
  totalUnitsOwned,
  businessMonthlyIncome,
  interestRateFor,
} from '../../game-engine/players';
import {
  upgradeCost,
  canUpgradeTrack,
  activeMarketingBoostTotal,
  businessHealthStatus,
  marketingAllowance,
  marketingCampaignsUsed,
  upgradesNeededForNextCampaign,
  marketingUpkeepAvailable,
} from '../../game-engine/businessUpgrades';
import { useHoldRepeat } from '../hooks/useHoldRepeat';
import { playSound } from '../audio/soundEngine';
import LedgerModal from './LedgerModal';
import LessonTip from './LessonTip';

const UPGRADE_TRACK_ORDER = ['marketing', 'sales', 'ops', 'rnd'];

/**
 * One upgrade button, with the same press-and-hold-to-repeat behaviour the
 * asset shop's Buy/Sell buttons have (hooks/useHoldRepeat.js) — a tap buys
 * one, holding past a second keeps buying and accelerates. Growing a
 * business to Sales Lv3 + Ops Lv3 was six separate round-trips through the
 * portfolio modal before; now it's one press.
 *
 * `canFire` is re-read on every repeat tick, so the repeat stops the instant
 * the track hits its cap or the cash runs out instead of hammering an action
 * that would only produce an error toast.
 *
 * It has to be its own component (rather than a loop body in
 * BusinessUpgrades) because useHoldRepeat is a hook — one per button, and
 * hooks can't be called in a loop inside another component.
 */
function UpgradeButton({ track, trackId, business, cost, capped, affordable, upkeep, onUpgrade }) {
  const enabled = !capped && affordable;
  const canFire = useCallback(() => enabled, [enabled]);
  const fire = useCallback(() => onUpgrade(business.id, trackId), [onUpgrade, business.id, trackId]);
  const hold = useHoldRepeat(fire, canFire);

  return (
    <button
      type="button"
      className="vf-btn vf-btn--sm vf-btn--ghost vf-biz-upgrades__btn"
      disabled={!enabled}
      title={track.blurb}
      {...hold}
    >
      {track.icon} {track.name} {capped ? '(maxed)' : `$${cost}`}
      {!capped && upkeep && <span className="vf-biz-upgrades__btn-tag"> upkeep</span>}
    </button>
  );
}

/** A business's upgrade section: read-only level/status chips always show
 * (so anyone glancing at this business — including from the game-over
 * screen — can see how it was grown), and the four action buttons only
 * appear when `canUpgrade` is true (this player's own live turn). */
function BusinessUpgrades({ business, month, cash, canUpgrade, onUpgrade }) {
  const activeBoost = activeMarketingBoostTotal(business, month);
  const pendingRnd = (business.pendingRnd || []).length;
  // Marketing's cap moves as the business grows (see
  // game/businessUpgrades.js's marketingAllowance), so it's shown as
  // used/allowed rather than a fixed "Lv x/3" like the other tracks — and
  // called out in red once it's exhausted, since the fix is to buy a
  // DIFFERENT track, which isn't obvious from a greyed-out button alone.
  const marketingUsed = marketingCampaignsUsed(business);
  const marketingMax = marketingAllowance(business);
  const marketingTapped = marketingUsed >= marketingMax;
  const upgradesNeeded = upgradesNeededForNextCampaign(business);
  // With the allowance gone, this month's upkeep campaign is what keeps the
  // business tended — worth saying out loud, since a "Campaigns 6/6" chip
  // otherwise reads as "no campaigns at all, ever".
  const upkeepOpen = marketingUpkeepAvailable(business, month);

  return (
    <div className="vf-biz-upgrades">
      <div className="vf-biz-upgrades__status">
        {activeBoost > 0 && (
          <span className="vf-biz-upgrades__chip vf-biz-upgrades__chip--active">📣 +${activeBoost}/mo campaign live</span>
        )}
        <span
          className={`vf-biz-upgrades__chip ${marketingTapped ? 'vf-biz-upgrades__chip--tapped' : ''}`}
          title={`Campaigns launched vs. allowed. Every Sales, Operations, or R&D upgrade on this business unlocks 2 more — and one upkeep campaign a month is always available on top, so a business can never become impossible to tend.`}
        >
          📣 Campaigns {marketingUsed}/{marketingMax}
          {upkeepOpen && ' +1 upkeep'}
        </span>
        <span className="vf-biz-upgrades__chip">🤝 Sales Lv{business.salesLevel || 0}/3</span>
        <span className="vf-biz-upgrades__chip">⚙️ Ops Lv{business.opsLevel || 0}/3</span>
        <span className="vf-biz-upgrades__chip">
          🔬 R&D {business.rndCount || 0}/2{pendingRnd > 0 && ` (${pendingRnd} pending)`}
        </span>
        <LessonTip conceptId="reinvestment" />
      </div>
      {canUpgrade && (
        <>
          <div className="vf-biz-upgrades__actions">
            {UPGRADE_TRACK_ORDER.map((trackId) => (
              <UpgradeButton
                key={trackId}
                trackId={trackId}
                track={BUSINESS_UPGRADE_TRACKS[trackId]}
                business={business}
                cost={upgradeCost(business, trackId)}
                capped={!canUpgradeTrack(business, trackId, month)}
                affordable={cash >= upgradeCost(business, trackId)}
                upkeep={trackId === 'marketing' && upkeepOpen}
                onUpgrade={onUpgrade}
              />
            ))}
          </div>
          {marketingTapped && (
            <p className={`vf-biz-upgrades__note ${upkeepOpen ? 'vf-biz-upgrades__note--upkeep' : ''}`}>
              {upkeepOpen ? (
                <>
                  📣 Campaigns for {business.name} are used up, but you can always run one upkeep campaign a month to
                  keep it tended. Buy {upgradesNeeded} more Sales, Operations, or R&amp;D upgrade
                  {upgradesNeeded === 1 ? '' : 's'} to unlock more.
                </>
              ) : (
                <>
                  📣 {business.name} has already run this month's upkeep campaign. Buy {upgradesNeeded} more Sales,
                  Operations, or R&amp;D upgrade{upgradesNeeded === 1 ? '' : 's'} to unlock more, or run another next
                  month.
                </>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Full portfolio breakdown for one player — opened by tapping their card in
 * PlayerPanel (live game) or a standings row on the game-over screen.
 * Shows quantity owned + lifetime average purchase price per asset (via
 * avgPurchasePrice in game/players.js), current value and gain/loss vs.
 * that average, plus each business, its current income, and how it's been
 * grown so far. Actionable (the four business-upgrade buttons) only when
 * `canUpgrade` is true — otherwise this is read-only and safe to open for
 * any player, including AI, at any time, even mid-turn or after the game
 * has ended.
 */
export default function PlayerDetailModal({ player, prices, allPlayers, month, weather, weatherIncomeAmounts, canUpgrade = false, onUpgradeBusiness, onClose }) {
  // Hooks must run on every render regardless of the early-return below —
  // this modal can be mounted (by GameBoard/GameOverScreen) before a
  // player is actually selected, so `player` starts out null.
  const [showLedger, setShowLedger] = useState(false);
  // No playSound('click') here: an upgrade already gets its own sound from
  // the log entry it produces (hooks/useGameSounds.js maps
  // 'businessUpgrade' to the level-up chime), and with press-and-hold
  // repeat now firing this many times a second, layering a second click on
  // top of every one turned into noise. Declared above the early return
  // below with the other hooks — `player` can legitimately be null here.
  const playerId = player?.id;
  const handleUpgrade = useCallback(
    (businessId, trackId) => {
      if (playerId) onUpgradeBusiness?.(playerId, businessId, trackId);
    },
    [onUpgradeBusiness, playerId]
  );

  if (!player) return null;

  function handleClose() {
    playSound('click');
    onClose();
  }

  function openLedger() {
    playSound('click');
    setShowLedger(true);
  }

  const totalAssetValue = assetValue(player, prices);
  const totalBusinessValue = businessValue(player);
  const totalBusinessIncome = player.businesses.reduce((sum, b) => sum + businessMonthlyIncome(b, month), 0);

  return (
    <div className="vf-modal-overlay" onClick={handleClose}>
      <div className="vf-card vf-portfolio" onClick={(e) => e.stopPropagation()}>
        <div className="vf-portfolio__header">
          <div className="vf-portfolio__who">
            <span>{player.avatar}</span>
            <span>{player.name}</span>
            {player.type === 'ai' && <span title="AI player">🤖</span>}
          </div>
          <div className="vf-portfolio__header-actions">
            <button
              type="button"
              className="vf-btn vf-btn--sm vf-btn--ghost"
              onClick={openLedger}
              title="See every dollar in and out, from day one"
            >
              📒 Cash Ledger
            </button>
            <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleClose}>
              Close
            </button>
          </div>
        </div>

        {player.type === 'ai' && player.personalityId && (
          <div className="vf-portfolio__bot-tag">
            <span>💬 "{getBotPersonality(player.personalityId).blurb}"</span>
            {player.skillLevelId && (
              <span className="vf-portfolio__bot-skill">
                {getSkillLevel(player.skillLevelId).icon} {getSkillLevel(player.skillLevelId).name}
              </span>
            )}
          </div>
        )}

        <div className="vf-portfolio__body vf-scroll">
          <div className="vf-portfolio__summary">
            <div className="vf-portfolio__summary-stat">
              <span className="vf-portfolio__summary-label">Net Worth</span>
              <span className="vf-portfolio__summary-value">${netWorth(player, prices).toLocaleString()}</span>
            </div>
            <div className="vf-portfolio__summary-stat">
              <span className="vf-portfolio__summary-label">Cash</span>
              <span className="vf-portfolio__summary-value">${Math.round(player.cash).toLocaleString()}</span>
            </div>
            <div className="vf-portfolio__summary-stat">
              <span className="vf-portfolio__summary-label">Assets Worth</span>
              <span className="vf-portfolio__summary-value">${Math.round(totalAssetValue).toLocaleString()}</span>
            </div>
            <div className="vf-portfolio__summary-stat">
              <span className="vf-portfolio__summary-label">Passive / mo</span>
              <span className="vf-portfolio__summary-value">${passiveIncome(player, { allPlayers, prices, month, weatherIncomeAmounts })}</span>
            </div>
          </div>

          <div>
            <div className="vf-portfolio__section-title">📦 Assets</div>
            <div className="vf-portfolio__assets">
              {ASSETS.map((asset) => {
                const qty = player.holdings[asset.id] || 0;
                const avgPrice = avgPurchasePrice(player, asset.id);
                const currentPrice = prices[asset.id];
                const currentValue = qty * currentPrice;
                const gainPct = avgPrice ? ((currentPrice - avgPrice) / avgPrice) * 100 : null;
                const isWeatherIncome = !!asset.weatherIncomeRange;
                const perUnit = perUnitIncome(asset, {
                  price: currentPrice,
                  totalOwned: totalUnitsOwned(allPlayers, asset.id),
                  weatherIncomeAmounts,
                });
                const incomeRange = isWeatherIncome ? getAssetIncomeRange(asset) : null;
                const stageName = weather ? WEATHER_STAGES[weather.stageId]?.name : null;
                const isInterest = !!asset.interestBearing;
                const interestRate = interestRateFor(asset, weatherIncomeAmounts);
                const priceOnly = !isWeatherIncome && !isInterest && asset.rentPerMonth === 0;

                if (qty === 0 && avgPrice === null) {
                  return (
                    <div key={asset.id} className="vf-portfolio__asset-row vf-portfolio__asset-row--empty">
                      <span className="vf-portfolio__asset-icon">{asset.icon}</span>
                      <div>
                        <div className="vf-portfolio__asset-name">{asset.name}</div>
                        <div className="vf-portfolio__asset-detail">
                          Never bought
                          {priceOnly && ' · price only, no monthly income'}
                          {isInterest && ` · earns ${(interestRate * 100).toFixed(2)}%/mo interest right now`}
                          {isWeatherIncome && incomeRange && ` · income varies with weather & cards ($${incomeRange[0]}–$${incomeRange[1]}/mo per unit)`}
                        </div>
                      </div>
                      <span className="vf-portfolio__asset-value">—</span>
                    </div>
                  );
                }

                return (
                  <div key={asset.id} className="vf-portfolio__asset-row">
                    <span className="vf-portfolio__asset-icon">{asset.icon}</span>
                    <div>
                      <div className="vf-portfolio__asset-name">
                        {asset.name} · {qty} owned
                      </div>
                      <div className="vf-portfolio__asset-detail">
                        Avg paid: {avgPrice !== null ? `$${avgPrice.toFixed(2)}` : '—'} · Now: $
                        {currentPrice.toFixed(2)}
                        {asset.rentPerMonth > 0 && qty > 0 && perUnit > 0 && (
                          <> · +${(qty * perUnit).toFixed(0)}/mo rent</>
                        )}
                        {isWeatherIncome && qty > 0 && (
                          <>
                            {' '}
                            · +${(qty * perUnit).toFixed(0)}/mo right now{stageName ? ` (${stageName})` : ''}
                            {incomeRange && <> · range ${incomeRange[0]}–${incomeRange[1]}/mo per unit</>}
                          </>
                        )}
                        {isInterest && qty > 0 && (
                          <>
                            {' '}
                            · +${(qty * perUnit).toFixed(2)}/mo interest ({(interestRate * 100).toFixed(2)}% this month)
                          </>
                        )}
                        {priceOnly && <> · price only, no monthly income</>}
                      </div>
                    </div>
                    <div>
                      <div className="vf-portfolio__asset-value">${Math.round(currentValue).toLocaleString()}</div>
                      {gainPct !== null && (
                        <div
                          className={`vf-portfolio__asset-gain ${
                            gainPct >= 0 ? 'vf-portfolio__asset-gain--up' : 'vf-portfolio__asset-gain--down'
                          }`}
                        >
                          {gainPct >= 0 ? '▲' : '▼'} {Math.abs(gainPct).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="vf-portfolio__section-title">
              🚀 Businesses ({player.businesses.length}) — ${Math.round(totalBusinessValue).toLocaleString()} value,
              ${totalBusinessIncome}/mo
              {canUpgrade && player.businesses.length > 0 && (
                <span className="vf-portfolio__section-hint"> · Hold an invest button to buy several</span>
              )}
            </div>
            {player.businesses.length === 0 ? (
              <p className="vf-portfolio__empty">No businesses started yet.</p>
            ) : (
              <div className="vf-portfolio__businesses">
                {player.businesses.map((biz, i) => {
                  const health = businessHealthStatus(biz, month);
                  return (
                  <div key={biz.id} className="vf-portfolio__business-card">
                    <div className="vf-portfolio__business-row">
                      <span>
                        🚀{' '}
                        <span
                          className={
                            health === 'declining'
                              ? 'vf-portfolio__business-name--declining'
                              : health === 'warning'
                              ? 'vf-portfolio__business-name--warning'
                              : ''
                          }
                        >
                          {biz.name || `Business #${i + 1}`}
                        </span>
                        {health === 'declining' && (
                          <span
                            className="vf-portfolio__business-health-tag vf-portfolio__business-health-tag--declining"
                            title="Losing income from neglect — buy any upgrade to turn it around."
                          >
                            📉 declining
                          </span>
                        )}
                        {health === 'warning' && (
                          <span
                            className="vf-portfolio__business-health-tag vf-portfolio__business-health-tag--warning"
                            title="Hasn't been reinvested in for a while — will start losing income soon if left alone."
                          >
                            ⚠️ needs attention
                          </span>
                        )}
                      </span>
                      <span className="vf-portfolio__business-income">+${businessMonthlyIncome(biz, month)}/mo</span>
                    </div>
                    <BusinessUpgrades
                      business={biz}
                      month={month}
                      cash={player.cash}
                      canUpgrade={canUpgrade}
                      onUpgrade={handleUpgrade}
                    />
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <LedgerModal open={showLedger} onClose={() => setShowLedger(false)} player={player} />
    </div>
  );
}
