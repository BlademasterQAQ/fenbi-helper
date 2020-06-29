const _ = require('lodash')
const moment = require('moment')

const {httpRequest} = require('../util/httpUtil');


// let exerciseId = 1022904952;

let headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "accept-language": "zh-CN,zh-TW;q=0.9,zh;q=0.8",
    "cache-control": "max-age=0",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "cookie": "sid=7416563815331997892; persistent=H9eAWL2PCPLL8bhDi/48uI2pAeNcJ1J+QPHYufroaKyEtjDaewdsV2UiqEm5tJCswDN9sNvX7TxAkAzQuTpxog==; sess=C+nk7FWUnyBPAsQ1ag6ZB+n2CaGJ0EwAlVYggDJnJtSGeeXJN+f72tfHxAVvdIvhSJO0yrNiWXjInhiKr/dE6RVqaM1LSdiWzT5785laQq4=; userid=65047752"
};

async function getQuestionByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/questions?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questions.map(q => q.id), questions)
}

async function getQuestionMetaByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/question/meta?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questions.map(q => q.id), questions)
}

async function getQuestionKeyPointsByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/solution/keypoints?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questionIds, questions);
}

function getExerciseReport(exerciseId) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/exercises/${exerciseId}/report/v2`,
        method: "GET",
        json: true,
        headers
    });
}

function getExercise(exerciseId) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/exercises/${exerciseId}`,
        method: "GET",
        json: true,
        headers
    });
}

async function getExerciseHistory() {
    let cursorArr = [0, 30];
    let hisArr = await Promise.all(cursorArr.map(cursor => {
        return httpRequest({
            url: `https://tiku.fenbi.com/api/xingce/category-exercises?categoryId=3&cursor=${cursor}&count=30`,
            method: "GET",
            json: true,
            headers
        });
    }));
    return _.flatMap(hisArr, his => his.datas);
}

async function getSolutionsByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/solutions?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questionIds, questions);
}

exports.getExerciseHistory = async function () {
    let exerciseHistory = await getExerciseHistory();
    // exerciseHistory.map()
    // let resultObj = await getExerciseReport(9999);
    exerciseHistory = exerciseHistory.filter(h => h.status === 1);
    let exerciseReportMap = _.zipObject(exerciseHistory.map(item => item.id), await Promise.all(exerciseHistory.map(item => getExerciseReport(item.id))));
    exerciseHistory.forEach(history => {
        history.finishedTime = moment(history.updatedTime).format('YYYY-MM-DD HH:mm:ss')

        let report = exerciseReportMap[history.id];
        if (report) {
            history.elapsedTime = report.elapsedTime;
            history.correctRate = report.correctRate;
        }
    });


    return {
        exerciseHistory: exerciseHistory.filter(h => h.status === 1),
        moment
    }
}

exports.getResultObj = async function (exerciseId, costThreshold) {
    let [exercise, report] = await Promise.all([getExercise(exerciseId), getExerciseReport(exerciseId)]);

    let answerResultMap = {};
    report.answers.forEach(answer => {
        // 只筛选出你做了的
        if (answer.status !== 10) {
            answerResultMap[answer.questionId] = answer.correct;
        }
    });

    let concernQuestions = Object.keys(exercise.userAnswers).map(idx => {
        let ua = exercise.userAnswers[idx];
        let correct = answerResultMap[ua.questionId];
        if (ua.time > costThreshold || !correct) {
            return {
                idx: ua.questionIndex,
                questionId: ua.questionId,
                correct,
                cost: ua.time
            }
        } else {
            return null;
        }
    }).filter(a => a);

    // let questionContentMap = await getQuestionByIds(concernQuestions.map(q => q.questionId));
    // let questionMetaMap = await getQuestionMetaByIds(concernQuestions.map(q => q.questionId));
    // let questionKeyPointsMap = await getQuestionKeyPointsByIds(concernQuestions.map(q => q.questionId));
    let solutionMap = await getSolutionsByIds(concernQuestions.map(q => q.questionId));

    concernQuestions = _.orderBy(concernQuestions, ['correct', 'cost', 'idx'], ['asc', 'desc', 'asc']);

    concernQuestions.forEach(q => {
        let solutionObj = solutionMap[q.questionId];
        // 题干
        q.content = solutionObj.content; // html
        // 选项
        q.options = solutionObj.accessories[0].options;
        // 难度
        q.difficulty = solutionObj.difficulty;
        // 正确答案
        q.correctAnswer = solutionObj.correctAnswer;
        // 题目来源
        q.source = solutionObj.source;
        // 答案解析
        q.solution = solutionObj.solution; // html

        q.mostWrongAnswer = solutionObj.questionMeta.mostWrongAnswer;

        q.correctRatio = solutionObj.questionMeta.correctRatio;

        // q.userAnswer = solutionObj.userAnswer;
        q.keypoints = solutionObj.keypoints;
    });
    let incorrect = concernQuestions.filter(q => !q.correct)
    let correct = concernQuestions.filter(q => q.correct)
    return {
        exerciseId,
        costThreshold,
        incorrect,
        correct
    }
}

