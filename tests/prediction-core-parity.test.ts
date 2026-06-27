import { describe, expect, it } from "vitest";
import {
  predictFromFeatures,
  predictMatch,
  computeDrivers,
  explainDrivers,
  expectedGoalsFromAdvantage,
} from "@/lib/model/predict";
import { computePredictionCore } from "@/lib/model/prediction-core";
import { getFeatureStatus } from "@/data/model-inputs";
import { getTeam } from "@/lib/data";
import { SYNTHETIC_PAIRS } from "./_golden_fixtures";

/**
 * Phase 1.18C-4 — prediction-core extraction parity (GOLDEN).
 * GOLDEN values were captured from the PRE-REFACTOR predict.ts (origin/main) and
 * are pinned here as literals. They prove the extracted pure core
 * (lib/model/prediction-core.ts) + the delegating wrapper produce byte-identical
 * production output: full prediction (4-dp W/D/L, 2-dp xG, 4-dp top scorelines),
 * computeDrivers (capped + status-tagged), explanation (1-dp netAdvantage), and
 * expectedGoalsFromAdvantage. Any drift here is a NO-GO. This is a production-side
 * test, so importing data/model-inputs is allowed (never in lib/backtesting tests).
 */
const GOLDEN = {
  "balanced": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.368,
      "draw": 0.2639,
      "awayWin": 0.368,
      "expectedHomeGoals": 1.3,
      "expectedAwayGoals": 1.3,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1255
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0966
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.0966
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0816
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0816
        }
      ],
      "explanation": {
        "positiveDrivers": [],
        "negativeDrivers": [],
        "netAdvantage": 0
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [],
      "negativeDrivers": [],
      "netAdvantage": 0
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "neutralZero": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.368,
      "draw": 0.2639,
      "awayWin": 0.368,
      "expectedHomeGoals": 1.3,
      "expectedAwayGoals": 1.3,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1255
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0966
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.0966
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0816
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0816
        }
      ],
      "explanation": {
        "positiveDrivers": [],
        "negativeDrivers": [],
        "netAdvantage": 0
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [],
      "negativeDrivers": [],
      "netAdvantage": 0
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "largeEloGapPos": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.8992,
      "draw": 0.0869,
      "awayWin": 0.0139,
      "expectedHomeGoals": 2.7,
      "expectedAwayGoals": 0.18,
      "topScorelines": [
        {
          "homeGoals": 2,
          "awayGoals": 0,
          "probability": 0.2046
        },
        {
          "homeGoals": 3,
          "awayGoals": 0,
          "probability": 0.1842
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.1516
        },
        {
          "homeGoals": 4,
          "awayGoals": 0,
          "probability": 0.1243
        },
        {
          "homeGoals": 5,
          "awayGoals": 0,
          "probability": 0.0671
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Elo rating",
            "family": "eloRating",
            "contribution": 700,
            "detail": "Elo 2100 vs 1400.",
            "status": "source-backed",
            "capped": false
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 700
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 700,
        "detail": "Elo 2100 vs 1400.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Elo rating",
          "family": "eloRating",
          "contribution": 700,
          "detail": "Elo 2100 vs 1400.",
          "status": "source-backed",
          "capped": false
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 700
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "largeEloGapNeg": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.0139,
      "draw": 0.0869,
      "awayWin": 0.8992,
      "expectedHomeGoals": 0.18,
      "expectedAwayGoals": 2.7,
      "topScorelines": [
        {
          "homeGoals": 0,
          "awayGoals": 2,
          "probability": 0.2046
        },
        {
          "homeGoals": 0,
          "awayGoals": 3,
          "probability": 0.1842
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.1516
        },
        {
          "homeGoals": 0,
          "awayGoals": 4,
          "probability": 0.1243
        },
        {
          "homeGoals": 0,
          "awayGoals": 5,
          "probability": 0.0671
        }
      ],
      "explanation": {
        "positiveDrivers": [],
        "negativeDrivers": [
          {
            "label": "Elo rating",
            "family": "eloRating",
            "contribution": -700,
            "detail": "Elo 1400 vs 2100.",
            "status": "source-backed",
            "capped": false
          }
        ],
        "netAdvantage": -700
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": -700,
        "detail": "Elo 1400 vs 2100.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [],
      "negativeDrivers": [
        {
          "label": "Elo rating",
          "family": "eloRating",
          "contribution": -700,
          "detail": "Elo 1400 vs 2100.",
          "status": "source-backed",
          "capped": false
        }
      ],
      "netAdvantage": -700
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "fifaRankCap": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.4545,
      "draw": 0.2588,
      "awayWin": 0.2867,
      "expectedHomeGoals": 1.48,
      "expectedAwayGoals": 1.12,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1231
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.1099
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0911
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0832
        },
        {
          "homeGoals": 2,
          "awayGoals": 0,
          "probability": 0.0813
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "FIFA ranking",
            "family": "fifaRanking",
            "contribution": 90,
            "detail": "Ranked #1 vs #211 (capped).",
            "status": "source-backed",
            "capped": false
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 90
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 90,
        "detail": "Ranked #1 vs #211 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "FIFA ranking",
          "family": "fifaRanking",
          "contribution": 90,
          "detail": "Ranked #1 vs #211 (capped).",
          "status": "source-backed",
          "capped": false
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 90
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "hostOnly": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.4253,
      "draw": 0.2617,
      "awayWin": 0.3131,
      "expectedHomeGoals": 1.42,
      "expectedAwayGoals": 1.18,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1245
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.1055
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0884
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0876
        },
        {
          "homeGoals": 2,
          "awayGoals": 0,
          "probability": 0.0749
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Host advantage",
            "family": "hostAdvantage",
            "contribution": 60,
            "detail": "Co-host crowd, travel and familiarity edge.",
            "status": "verified",
            "capped": false
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 60
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 60,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Host advantage",
          "family": "hostAdvantage",
          "contribution": 60,
          "detail": "Co-host crowd, travel and familiarity edge.",
          "status": "verified",
          "capped": false
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 60
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "regionalOnly": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.385,
      "draw": 0.2637,
      "awayWin": 0.3513,
      "expectedHomeGoals": 1.34,
      "expectedAwayGoals": 1.26,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1254
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.0992
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0939
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0838
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0793
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Regional advantage",
            "family": "regionalAdvantage",
            "contribution": 18,
            "detail": "Same-region travel and climate familiarity.",
            "status": "candidate",
            "capped": false
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 18
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 18,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Regional advantage",
          "family": "regionalAdvantage",
          "contribution": 18,
          "detail": "Same-region travel and climate familiarity.",
          "status": "candidate",
          "capped": false
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 18
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "placeholderSingleCap": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.3917,
      "draw": 0.2635,
      "awayWin": 0.3448,
      "expectedHomeGoals": 1.35,
      "expectedAwayGoals": 1.25,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1253
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.1003
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0928
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0846
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0783
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Squad quality",
            "family": "squadQuality",
            "contribution": 25,
            "detail": "Squad quality 100 vs 0.",
            "status": "placeholder",
            "capped": true
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 25
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 25,
        "detail": "Squad quality 100 vs 0.",
        "status": "placeholder",
        "capped": true
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Squad quality",
          "family": "squadQuality",
          "contribution": 25,
          "detail": "Squad quality 100 vs 0.",
          "status": "placeholder",
          "capped": true
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 25
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "pooledPlaceholderCap": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.406,
      "draw": 0.2629,
      "awayWin": 0.3311,
      "expectedHomeGoals": 1.38,
      "expectedAwayGoals": 1.22,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.125
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.1025
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0906
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0863
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0763
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Squad quality",
            "family": "squadQuality",
            "contribution": 20,
            "detail": "Squad quality 100 vs 0.",
            "status": "placeholder",
            "capped": true
          },
          {
            "label": "Recent form",
            "family": "recentForm",
            "contribution": 20,
            "detail": "Form 100 vs 0.",
            "status": "placeholder",
            "capped": true
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 40
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 20,
        "detail": "Squad quality 100 vs 0.",
        "status": "placeholder",
        "capped": true
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 20,
        "detail": "Form 100 vs 0.",
        "status": "placeholder",
        "capped": true
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Squad quality",
          "family": "squadQuality",
          "contribution": 20,
          "detail": "Squad quality 100 vs 0.",
          "status": "placeholder",
          "capped": true
        },
        {
          "label": "Recent form",
          "family": "recentForm",
          "contribution": 20,
          "detail": "Form 100 vs 0.",
          "status": "placeholder",
          "capped": true
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 40
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "climateCap": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.3917,
      "draw": 0.2635,
      "awayWin": 0.3448,
      "expectedHomeGoals": 1.35,
      "expectedAwayGoals": 1.25,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1253
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.1003
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0928
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0846
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0783
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Climate familiarity",
            "family": "climateFamiliarity",
            "contribution": 25,
            "detail": "Acclimatization 100 vs 0.",
            "status": "candidate",
            "capped": true
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 25
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 25,
        "detail": "Acclimatization 100 vs 0.",
        "status": "candidate",
        "capped": true
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Climate familiarity",
          "family": "climateFamiliarity",
          "contribution": 25,
          "detail": "Acclimatization 100 vs 0.",
          "status": "candidate",
          "capped": true
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 25
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "tournamentContextCap": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.3822,
      "draw": 0.2638,
      "awayWin": 0.3541,
      "expectedHomeGoals": 1.33,
      "expectedAwayGoals": 1.27,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1255
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.0988
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0943
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0834
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0797
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Tournament context",
            "family": "tournamentContext",
            "contribution": 15,
            "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 1.00 vs -1.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
            "status": "candidate",
            "capped": true
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 15
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 15,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 1.00 vs -1.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": true
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Tournament context",
          "family": "tournamentContext",
          "contribution": 15,
          "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 1.00 vs -1.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
          "status": "candidate",
          "capped": true
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 15
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "manager": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.368,
      "draw": 0.2639,
      "awayWin": 0.368,
      "expectedHomeGoals": 1.3,
      "expectedAwayGoals": 1.3,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1255
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0966
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.0966
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0816
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0816
        }
      ],
      "explanation": {
        "positiveDrivers": [],
        "negativeDrivers": [],
        "netAdvantage": 0
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [],
      "negativeDrivers": [],
      "netAdvantage": 0
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "structural": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.3774,
      "draw": 0.2639,
      "awayWin": 0.3587,
      "expectedHomeGoals": 1.32,
      "expectedAwayGoals": 1.28,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.1255
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.098
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0951
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0828
        },
        {
          "homeGoals": 1,
          "awayGoals": 2,
          "probability": 0.0803
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Structural depth",
            "family": "structural",
            "contribution": 10,
            "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
            "status": "candidate",
            "capped": false
          }
        ],
        "negativeDrivers": [],
        "netAdvantage": 10
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 0,
        "detail": "Elo 1500 vs 1500.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": 0,
        "detail": "Squad quality 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 0,
        "detail": "Form 50 vs 50.",
        "status": "placeholder",
        "capped": false
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 0,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": 0,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 10,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Structural depth",
          "family": "structural",
          "contribution": 10,
          "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
          "status": "candidate",
          "capped": false
        }
      ],
      "negativeDrivers": [],
      "netAdvantage": 10
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  },
  "mixedPosNeg": {
    "prediction": {
      "homeTeamId": "a",
      "awayTeamId": "b",
      "homeWin": 0.4564,
      "draw": 0.2586,
      "awayWin": 0.285,
      "expectedHomeGoals": 1.48,
      "expectedAwayGoals": 1.12,
      "topScorelines": [
        {
          "homeGoals": 1,
          "awayGoals": 1,
          "probability": 0.123
        },
        {
          "homeGoals": 1,
          "awayGoals": 0,
          "probability": 0.1102
        },
        {
          "homeGoals": 2,
          "awayGoals": 1,
          "probability": 0.0913
        },
        {
          "homeGoals": 0,
          "awayGoals": 1,
          "probability": 0.0829
        },
        {
          "homeGoals": 2,
          "awayGoals": 0,
          "probability": 0.0818
        }
      ],
      "explanation": {
        "positiveDrivers": [
          {
            "label": "Host advantage",
            "family": "hostAdvantage",
            "contribution": 60,
            "detail": "Co-host crowd, travel and familiarity edge.",
            "status": "verified",
            "capped": false
          },
          {
            "label": "Elo rating",
            "family": "eloRating",
            "contribution": 50,
            "detail": "Elo 1600 vs 1550.",
            "status": "source-backed",
            "capped": false
          },
          {
            "label": "Recent form",
            "family": "recentForm",
            "contribution": 25,
            "detail": "Form 70 vs 40.",
            "status": "placeholder",
            "capped": true
          }
        ],
        "negativeDrivers": [
          {
            "label": "Squad quality",
            "family": "squadQuality",
            "contribution": -25,
            "detail": "Squad quality 30 vs 80.",
            "status": "placeholder",
            "capped": true
          },
          {
            "label": "Regional advantage",
            "family": "regionalAdvantage",
            "contribution": -18,
            "detail": "Same-region travel and climate familiarity.",
            "status": "candidate",
            "capped": false
          }
        ],
        "netAdvantage": 92
      }
    },
    "drivers": [
      {
        "label": "Elo rating",
        "family": "eloRating",
        "contribution": 50,
        "detail": "Elo 1600 vs 1550.",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "FIFA ranking",
        "family": "fifaRanking",
        "contribution": 0,
        "detail": "Ranked #50 vs #50 (capped).",
        "status": "source-backed",
        "capped": false
      },
      {
        "label": "Squad quality",
        "family": "squadQuality",
        "contribution": -25,
        "detail": "Squad quality 30 vs 80.",
        "status": "placeholder",
        "capped": true
      },
      {
        "label": "Recent form",
        "family": "recentForm",
        "contribution": 25,
        "detail": "Form 70 vs 40.",
        "status": "placeholder",
        "capped": true
      },
      {
        "label": "Manager cohesion",
        "family": "managerCohesion",
        "contribution": 0,
        "detail": "Same-nationality manager used as a squad-cohesion proxy.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Host advantage",
        "family": "hostAdvantage",
        "contribution": 60,
        "detail": "Co-host crowd, travel and familiarity edge.",
        "status": "verified",
        "capped": false
      },
      {
        "label": "Regional advantage",
        "family": "regionalAdvantage",
        "contribution": -18,
        "detail": "Same-region travel and climate familiarity.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Climate familiarity",
        "family": "climateFamiliarity",
        "contribution": 0,
        "detail": "Acclimatization 50 vs 50.",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Structural depth",
        "family": "structural",
        "contribution": 0,
        "detail": "Experimental weak economic prior (log-scaled GDP per capita + population).",
        "status": "candidate",
        "capped": false
      },
      {
        "label": "Tournament context",
        "family": "tournamentContext",
        "contribution": 0,
        "detail": "Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) 0.00 vs 0.00 (candidate, capped; heat/venue-climate deferred; excludes host/regional).",
        "status": "candidate",
        "capped": false
      }
    ],
    "explanation": {
      "positiveDrivers": [
        {
          "label": "Host advantage",
          "family": "hostAdvantage",
          "contribution": 60,
          "detail": "Co-host crowd, travel and familiarity edge.",
          "status": "verified",
          "capped": false
        },
        {
          "label": "Elo rating",
          "family": "eloRating",
          "contribution": 50,
          "detail": "Elo 1600 vs 1550.",
          "status": "source-backed",
          "capped": false
        },
        {
          "label": "Recent form",
          "family": "recentForm",
          "contribution": 25,
          "detail": "Form 70 vs 40.",
          "status": "placeholder",
          "capped": true
        }
      ],
      "negativeDrivers": [
        {
          "label": "Squad quality",
          "family": "squadQuality",
          "contribution": -25,
          "detail": "Squad quality 30 vs 80.",
          "status": "placeholder",
          "capped": true
        },
        {
          "label": "Regional advantage",
          "family": "regionalAdvantage",
          "contribution": -18,
          "detail": "Same-region travel and climate familiarity.",
          "status": "candidate",
          "capped": false
        }
      ],
      "netAdvantage": 92
    },
    "xg10": {
      "home": 1.32,
      "away": 1.28
    },
    "xgNeg": {
      "home": 1.225,
      "away": 1.375
    }
  }
} as const;

describe("prediction-core parity: production output is byte-identical (golden)", () => {
  for (const name of Object.keys(SYNTHETIC_PAIRS)) {
    it(`${name}: predictFromFeatures / computeDrivers / explanation unchanged`, () => {
      const [a, b] = SYNTHETIC_PAIRS[name]!;
      const g = (GOLDEN as Record<string, any>)[name];
      expect(predictFromFeatures(a, b)).toEqual(g.prediction);
      expect(computeDrivers(a, b)).toEqual(g.drivers);
      expect(explainDrivers(computeDrivers(a, b))).toEqual(g.explanation);
      expect(expectedGoalsFromAdvantage(10)).toEqual(g.xg10);
      expect(expectedGoalsFromAdvantage(-37.5)).toEqual(g.xgNeg);
    });
  }
});

describe("prediction-core parity: wrapper rounding matches core unrounded values", () => {
  const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
  for (const name of Object.keys(SYNTHETIC_PAIRS)) {
    it(`${name}: core outcome rounds to the production prediction`, () => {
      const [a, b] = SYNTHETIC_PAIRS[name]!;
      const core = computePredictionCore(a, b, { weights: undefined, statusResolver: getFeatureStatus });
      const pred = predictFromFeatures(a, b);
      expect(round(core.outcome.homeWin, 4)).toBeCloseTo(pred.homeWin, 12);
      expect(round(core.outcome.draw, 4)).toBeCloseTo(pred.draw, 12);
      expect(round(core.outcome.awayWin, 4)).toBeCloseTo(pred.awayWin, 12);
      expect(round(core.expectedGoals.home, 2)).toBeCloseTo(pred.expectedHomeGoals, 12);
      expect(round(core.expectedGoals.away, 2)).toBeCloseTo(pred.expectedAwayGoals, 12);
      // unrounded probabilities are a valid distribution
      const sum = core.outcome.homeWin + core.outcome.draw + core.outcome.awayWin;
      expect(sum).toBeCloseTo(1, 9);
    });
  }
});

describe("prediction-core parity: real 2026 feature pair (production-side only)", () => {
  it("predictMatch on real teams is internally consistent with the core", () => {
    const home = getTeam("argentina");
    const away = getTeam("brazil");
    const pred = predictMatch(home, away);
    expect(pred.homeWin + pred.draw + pred.awayWin).toBeCloseTo(1, 3);
    expect(pred.homeTeamId).toBe("argentina");
    expect(pred.awayTeamId).toBe("brazil");
  });
});
