import { getStageInfo } from '../../game-engine/weather';
import { businessWeatherPercent } from '../../game-engine/players';
import { getWeatherSeverity } from '../../data/gameConfig';

/**
 * A fuller weather readout for the sidebar — the header's WeatherBadge stays
 * as a quick-glance pill, this shows the current stage's blurb too.
 *
 * It also now states, in plain numbers, what the weather is doing to BUSINESS
 * revenue this month. That effect is new (businesses used to ignore the
 * weather entirely) and it is invisible without saying so: a player whose
 * business income drops 22% in a storm needs to be able to see the storm is
 * the reason, not a bug.
 */
export default function WeatherCard({ weather, weatherIncomeAmounts, weatherSeverityId }) {
  const info = getStageInfo(weather);
  const businessPct = businessWeatherPercent(weatherIncomeAmounts);
  const severity = getWeatherSeverity(weatherSeverityId);

  return (
    <div className="vf-card vf-weather-card">
      <div className="vf-weather-card__icon">{info.icon}</div>
      <div className="vf-weather-card__body">
        <div className="vf-weather-card__name">{info.name}</div>
        <div className="vf-weather-card__blurb">{info.blurb}</div>
        {businessPct !== 0 && (
          <div
            className={`vf-weather-card__business ${
              businessPct > 0 ? 'vf-weather-card__business--up' : 'vf-weather-card__business--down'
            }`}
            title={`Weather severity for this game: ${severity.name}. It scales both price moves and business revenue.`}
          >
            🚀 Business revenue {businessPct > 0 ? '+' : ''}
            {businessPct}% this month
          </div>
        )}
      </div>
    </div>
  );
}
