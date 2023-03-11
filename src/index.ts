import {config} from 'dotenv';

import express from 'express';
import {regExpDate} from './constants'
import {formatRFC3339} from 'date-fns';
import TelegramBot from 'node-telegram-bot-api';
import {google} from 'googleapis';

config();

const app = express();
const gitelmanQuery: string =
    'обед|обедаю|завтрак|ужинаю|дегустация|соревнования|соревнование|отдельно|любимой|хейтеры|серце|сердце|подмышки|брою|бритье|поединок|бой|попойка';
const listOfId: string[] = [];
let listOfLinks: string[] = [];

const botStatus = {
    isReadyToPublishedAfter: false,
    isReadyToPublishedBefore: false,
    isPublishedAfter: false,
    isPublishedBefore: false
};

const dates = {
    publishedAfter: undefined,
    publishedBefore: undefined
};

const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_API_KEY}/sendMessage`;

const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY
});

const bot = new TelegramBot(process.env.TELEGRAM_BOT_API_KEY, {polling: true});

app.get('/', async (req, res) => {
    res.send('Hello World!');
});

type IGetListOfVideo = {
    publishedAfter: string,
    publishedBefore: string,
    query?: string
};

const formatStringToDateArray = (value: string) => {
    return value.toLowerCase().replaceAll('-', ' ').split(' ').map((value) => +value);
};

const formatStringToQueryArray = (value?: string) => {
    if (value) {
        return value.toLowerCase().replaceAll(' ', '|').trim();
    }
}

const getListOfVideo = ({publishedBefore, publishedAfter, query}: IGetListOfVideo) => {
    const [afterYear, afterMonth, afterDay] = formatStringToDateArray(publishedAfter);
    const [beforeYear, beforeMonth, beforeDay] = formatStringToDateArray(publishedBefore);
    const queryParams = formatStringToQueryArray(query);
        return youtube.search.list({
            channelId: 'UCcpCC6H9EqNZ6iM2gnuzwxQ',
            part: ['snippet'],
            order: 'date',
            maxResults: 50,
            q: query ? queryParams : '',
            publishedAfter: formatRFC3339(new Date(afterYear, afterMonth, afterDay, 0, 0, 0)),
            publishedBefore: formatRFC3339(new Date(beforeYear, beforeMonth, beforeDay, 0, 0, 0)),
        })
            .then((response) => {
                console.log(response)
                response.data.items.map(({id: {videoId}}) => videoId).forEach((item, i, arr) => {
                    if (listOfId.length <= arr.length) {
                        listOfId.push(item);
                    }
                });
            })
            .then(() => {
                listOfLinks = listOfId.map((videoId) => {
                    return `https://www.youtube.com/watch?v=${videoId}`
                })
            })
            .catch((e) => {
                console.log(e);
            });

};

bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (msg.text !== "Найти") {
        if (regExpDate.test(msg.text)) {
            if (botStatus.isReadyToPublishedAfter && !botStatus.isPublishedAfter) {
                bot.sendMessage(chatId, `Хорошо, от числа ${msg.text}`).then(() => {
                    dates.publishedAfter = msg.text;
                });
                botStatus.isReadyToPublishedAfter = false;
                botStatus.isPublishedAfter = true;
            }
            if (botStatus.isReadyToPublishedBefore && !botStatus.isPublishedBefore) {
                bot.sendMessage(chatId, `Хорошо, до числа ${msg.text}`).then(() => {
                    dates.publishedBefore = msg.text
                });
                botStatus.isReadyToPublishedBefore = false;
                botStatus.isPublishedBefore = true;
            }
        }

    }
    if (msg.text === "Найти") {
        if (botStatus.isPublishedBefore && botStatus.isPublishedAfter) {
            bot.sendMessage(chatId, 'Идёт поиск...');
            setTimeout(() => {
                getListOfVideo({...dates})
                    .then(() => {
                        listOfLinks.length > 0 ? listOfLinks.forEach((video) => {
                                bot.sendMessage(chatId, video);
                            }) : bot.sendMessage(chatId, 'Ничего не найдено!')
                    })
                    .then(() => {
                        botStatus.isReadyToPublishedBefore = false;
                        botStatus.isReadyToPublishedAfter = false;
                        botStatus.isPublishedAfter = false;
                        botStatus.isPublishedBefore = false;
                    })
            }, 1000)

        }
        else {
            bot.sendMessage(chatId, "Вы что-то сделали не так! Сначала введите даты, потом ищите")
        }
    }
});

bot.on('callback_query', (msg) => {
})

bot.onText(/\/start/, (msg, match) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Выбери команды и введи нужные тебе периоды дат для видео.', {
        reply_markup: {
            keyboard: [[{text: "Даты от"}, {text: "Даты до"}, {text: "Ключевые слова"}], [{text: "Найти"}]]
        }
    });
});

bot.onText(/Даты от/, (msg) => {
    const chatId = msg.chat.id;
    botStatus.isReadyToPublishedAfter = true;
    bot.sendMessage(chatId, '' +
        'Введи даты от какого числа искать видео. Важно! Вводите даты в формате ГГГГ-ММ-ДД');
});

bot.onText(/Даты до/, (msg) => {
    const chatId = msg.chat.id;
    botStatus.isReadyToPublishedBefore = true;
    bot.sendMessage(chatId, '' +
        'Введи даты до какого числа искать видео. Важно! Вводите даты в формате ГГГГ-ММ-ДД');
});

bot.onText(/Ключевые слова/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Введи ключевые слова для поиска через пробел. Если их нет, то запрос будет по умолчанию');
});

app.listen(5000, () => {
    console.log('Server running');
});
