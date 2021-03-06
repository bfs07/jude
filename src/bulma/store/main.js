import Vue from "vue";
import * as Api from "../api";
import * as Helper from "../helpers";

export const types = {
  UPDATE_CONTEST_DATA: "main/UPDATE_CONTEST_DATA",
  FETCH_CONTEST_DATA: "main/FETCH_CONTEST_DATA",
  FETCH_AND_SHOW_SUBMISSION: "main/FETCH_AND_SHOW_SUBMISSION",
  UPDATE_SHOWN_SUBMISSION: "main/UPDATE_SHOWN_SUBMISSION",
  CLEAR_MODAL_TRIGGER: "main/CLEAR_MODAL_TRIGGER",
  SET_AUTO_FETCH_STANDINGS: "main/SET_AUTO_FETCH_STANDINGS",
  SET_COMPACT_TABLE: "main/SET_COMPACT_TABLE",
  SET_FORMATTED_PENALTY: "main/SET_FORMATTED_PENALTY",
  SET_UNOFFICIAL_LEVEL: "main/SET_UNOFFICIAL_LEVEL",
  SET_CLARIFICATIONS_CONFIG: "main/SET_CLARIFICATIONS_CONFIG",
  SET_SUBMISSIONS_CONFIG: "main/SET_SUBMISSIONS_CONFIG",
  SET_DASHBOARD_TAB: "main/SET_DASHBOARD_TAB",
  CHECK_CLARIFICATIONS: "main/CHECK_CLARIFICATIONS",
  MARK_BALLOON: "main/MARK_BALLOON",
  LOGOUT: "main/LOGOUT"
};

function cleanState() {
  const reset = {
    user: null,
    userObject: {},
    rawContest: {},
    rawSubmissions: [],
    rawClarifications: [],
    rawPrintouts: [],
    rawTeams: [],
    shownSubmission: {}
  };
  return reset;
}

export const state = {
  ...cleanState(),
  codeModalTrigger: false,
  persist: {
    dashboardTab: 0,
    checkClarifications: new Date(),
    deliveredBalloons: {}
  },
  config: {
    autoFetchStandings: false,
    compactTable: false,
    formattedPenalty: true,
    unofficialLevel: 1,
    clarifications: {
      sortByAnswer: true,
      onlyNonAnswered: false
    },
    submissions: {
      onlyAc: false,
      onlyUndelivered: false,
      byProblem: null
    }
  }
};

export const mutations = {
  [types.UPDATE_CONTEST_DATA](state, data) {
    state.user = data._user;
    state.userObject = data.userObject;
    state.rawContest = data.contest;
    state.rawTeams = data.teams;
    state.rawSubmissions = data.submissions;
    state.rawClarifications = data.clarifications;
    state.rawPrintouts = data.printouts;
  },
  [types.UPDATE_SHOWN_SUBMISSION](state, submission) {
    state.shownSubmission = submission;
    state.codeModalTrigger = true;
  },
  [types.CLEAR_MODAL_TRIGGER](state) {
    state.codeModalTrigger = false;
  },
  [types.SET_AUTO_FETCH_STANDINGS](state, value) {
    state.config.autoFetchStandings = value;
  },
  [types.SET_COMPACT_TABLE](state, value) {
    state.config.compactTable = value;
  },
  [types.SET_FORMATTED_PENALTY](state, value) {
    state.config.formattedPenalty = value;
  },
  [types.SET_UNOFFICIAL_LEVEL](state, value) {
    state.config.unofficialLevel = value;
  },
  [types.SET_CLARIFICATIONS_CONFIG](state, value) {
    state.config.clarifications = value;
  },
  [types.SET_SUBMISSIONS_CONFIG](state, value) {
    state.config.submissions = value;
  },
  [types.SET_DASHBOARD_TAB](state, value) {
    state.persist.dashboardTab = value;
  },
  [types.CHECK_CLARIFICATIONS](state) {
    state.persist.checkClarifications = new Date();
  },
  [types.MARK_BALLOON](state, value) {
    const { deliveredBalloons } = state.persist;
    if (!deliveredBalloons.hasOwnProperty(value.team))
      deliveredBalloons[value.team] = {};
    deliveredBalloons[value.team][value.problem] = value.state;
  },
  [types.LOGOUT](state) {
    const clean = cleanState();
    for (const [key, value] of Object.entries(clean))
      state[key] = { ...(state[key] || {}), ...value };
  }
};

export const computed = {
  isAdmin: (state) => {
    if (!state.userObject)
      return false;
    return Helper.isAdmin(state.userObject);
  },
  isDisabled: (state) => {
    if (!state.userObject)
      return true;
    return Helper.isAdmin(state.userObject) || state.userObject.disabled;
  },
  problems: (state, getters) => {
    const contest = state.rawContest;
    const { my } = getters;

    if (!my || !contest || !contest.problems)
      return [];
    const problems = Vue.util.extend([], contest.problems);

    for (let i = 0; i < problems.length; i++) {
      const prob = problems[i];

      const subs = (my.submissions || []).filter(v => v.problem === prob.problem._id);
      const scoringClass = Helper.getScoringClass(prob, contest);
      const scoring = Helper.getScoring(prob, contest);
      const evaluation = scoring.evalContext(subs);

      const solved = scoring.solved(evaluation);
      const attempted = scoring.attempted(evaluation);
      const points = evaluation.score;

      const pending = subs.filter(v => Object.keys(v.verdict).map(k => v.verdict[k]).filter(w => w.verdict === "VERDICT_INQ").length > 0).length > 0;

      Vue.set(problems, i, {
        ...prob, scoringClass, scoring, points, solved, attempted, pending
      });
    }

    return problems;
  },
  clarifications: (state, getters) => {
    const { problems } = getters;
    if (!state.rawClarifications || !state.rawContest || !problems)
      return [];

    return Vue.util.extend([], state.rawClarifications)
      .filter(c => !c.problem || getters.getRawProblem(c.problem) != null);
  },
  printouts: (state) => {
    if (!state.rawPrintouts || !state.rawContest)
      return [];
    return state.rawPrintouts;
  },
  my: (state, getters) => {
    if (!state.rawContest || !state.rawContest.scoring || getters.submissions === undefined)
      return { submissions: [], languages: getters.languages };
    const scoring = Helper.getScoringClassFromString(state.rawContest.scoring);

    const submissions = getters.submissions.filter(v => v._creator === state.user);

    return { scoring, submissions, languages: getters.languages };
  },
  submissions: (state, getters) => {
    const contest = state.rawContest;
    if (!state.rawSubmissions)
      return [];

    // Filter out submissions for problems that were removed.
    const submissions = Vue.util.extend([], state.rawSubmissions)
      .filter(sub => getters.getRawProblem(sub.problem) != null);

    if (!submissions || !contest || !contest.problems)
      return [];

    for (let i = 0; i < submissions.length; i++) {
      const sub = submissions[i];
      const { timeInContest } = sub;

      const problem = getters.getRawProblem(sub.problem);

      const scoring = Helper.getScoring(problem, contest);
      const score = scoring.eval(sub.verdict);

      Vue.set(submissions, i, { ...sub, timeInContest, score });
    }

    return submissions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  },
  groupedSubs: (state, getters) => {
    const { submissions } = getters;
    if (!submissions)
      return {};

    const res = {};
    for (const sub of submissions) {
      if (!res.hasOwnProperty(sub._creator))
        res[sub._creator] = [sub];
      else
        res[sub._creator].push(sub);
    }

    return res;
  },
  teams: (state, getters) => {
    const { my, problems } = getters;

    if (!state.rawTeams)
      return [];
    let teams = Vue.util.extend([], state.rawTeams);

    if (!teams || !my || !problems || !state.rawContest
            || !my.scoring || !getters.groupedSubs)
      return [];
    const { groupedSubs, isAdmin } = getters;
    const { rawContest } = state;

    for (let i = 0; i < teams.length; i++) {
      const results = {};
      const hasBlind = {};
      const arr = [];

      for (const prob of problems) {
        const subs = (groupedSubs[teams[i]._id] || [])
          .filter(v => v.problem === prob.problem._id);
        const filteredSubs = subs
          .filter(v => isAdmin || !Helper.isFrozen(rawContest, v.timeInContest));
        if (filteredSubs.length !== subs.length)
          hasBlind[prob.problem._id] = true;
        results[prob.problem._id] = prob.scoring.evalContext(filteredSubs);
        arr.push(results[prob.problem._id]);
      }

      const merged = getters.my.scoring.mergeEvaluations(arr,
                                                         rawContest.scoringOpts || {});
      Vue.set(teams, i, {
        ...teams[i], merged, results, hasBlind, rank: null
      });
    }

    teams = teams.sort((a, b) => {
      if (a.merged.score === b.merged.score)
        return a.merged.penalty - b.merged.penalty;
      return b.merged.score - a.merged.score;
    });

    let last = -1;
    let officials = 0;

    for (let i = 0; i < teams.length; i++) {
      if (!teams[i].unofficial || state.config.unofficialLevel >= 2) {
        officials++;
        if (last !== -1)
          Vue.set(teams, i, { ...teams[i], rank: teams[last].rank });
        if (last === -1 || teams[last].merged.score !== teams[i].merged.score || teams[last].merged.penalty !== teams[i].merged.penalty)
          Vue.set(teams, i, { ...teams[i], rank: officials });
        last = i;
      }
    }

    return teams;
  },
  teamMapping: (state, getters) => {
    const { teams } = getters;
    if (!teams)
      return {};
    const res = {};
    for (const team of teams)
      res[team._id] = team;
    return res;
  },
  languages: (state) => {
    if (!state.rawContest || !state.rawContest.languages)
      return {};
    return state.rawContest.languages;
  },
  unchecked: (state, getters) => {
    const { clarifications, printouts } = getters;
    return {
      clarifications: clarifications
        .filter(c => c.updatedAt > state.persist.checkClarifications).length,
      printouts: printouts.filter(p => !p.done).length
    };
  }
};

export const getters = {
  getRawProblem: state => (id) => {
    if (!state.rawContest)
      return undefined;

    for (const prob of state.rawContest.problems) {
      if (prob.problem._id === id)
        return prob;
    }

    return null;
  },
  getBalloon: state => (team, problem) => {
    const { deliveredBalloons } = state.persist;
    if (!deliveredBalloons.hasOwnProperty(team))
      return false;
    return Boolean(deliveredBalloons[team][problem]);
  }
};

export const actions = {
  async [types.FETCH_CONTEST_DATA](context) {
    const [contestResult, submissionsResult]
      = await Promise.all([Api.contest.get(), Api.submissions.get()]);

    context.commit(types.UPDATE_CONTEST_DATA, {
      ...contestResult.body,
      ...submissionsResult.body
    });
  },
  async [types.FETCH_AND_SHOW_SUBMISSION](context, submissionId) {
    const res = await Api.submission.get({ id: submissionId });
    context.commit(types.UPDATE_SHOWN_SUBMISSION, res.body);
  }
};
