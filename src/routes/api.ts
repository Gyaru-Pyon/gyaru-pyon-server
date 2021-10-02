import { RequestHandler, Response, Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { checkProperty } from "../tools";
import jwt from "jsonwebtoken";
import axios, { AxiosResponse } from "axios";
import { URLSearchParams } from "url";
import { Deepl } from "../types/deepl";
import { Tone, ToneResult } from "../types/tone";

const isLoggedIn: RequestHandler = (req, res, next) => {
  if (req.user == null) return error(res, 401, 'unauthorized')
  next();
};

const router: Router = Router();
const prisma = new PrismaClient();

router.get("/", (req, res) => {
  res.json({ ok: true });
});

router.post("/auth/teacher/signin", async (req, res) => {
  if (!checkProperty(req.body, ["name", "password"]))
    return error(res, 400, { message: "invalid request" });

  const user = await prisma.user.findUnique({ where: { name: `${req.body.name}` } });

  if (!user || !(await bcrypt.compare(`${req.body.password}`, user.password_digest)))
    return error(res, 404, { message: "not found" });

  success(res, {
    access_token: jwt.sign({ user_id: user.id, type: 'access_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '1h' }),
    refresh_token: jwt.sign({ user_id: user.id, type: 'refresh_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '30d' })
  })
});

router.post("/auth/signup", async (req, res) => {
  if (!checkProperty(req.body, ["name", "password"]))
    return error(res, 400, { message: "invalid request" });

  if(await prisma.user.findUnique({ where: { name: `${req.body.name}` } }))
    return error(res, 409, { message: "already registered name" });

  const user = await prisma.user.create({
    data: {
      name: `${req.body.name}`,
      password_digest: await bcrypt.hash(`${req.body.password}`, 10)
    },
  });

  success(res, {
    access_token: jwt.sign({ user_id: user.id, type: 'access_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '1h' }),
    refresh_token: jwt.sign({ user_id: user.id, type: 'refresh_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '30d' })
  })
});

router.post("/auth/token", async (req, res) => {
  if (!checkProperty(req.body, ["refresh_token"]))
    return error(res, 400, { message: "invalid request" });

  try {
    const token = jwt.verify(req.body.refresh_token, `${process.env.JWT_SECRET}`)
    if(typeof token == 'string') return error(res, 400, { message: "invalid refresh token" });
    if(token.type != 'refresh_token') return error(res, 400, { message: "invalid refresh token" });

    const user = await prisma.user.findUnique({ where: {id: token.user_id} })
    
    if(!user) return error(res, 400, { message: "invalid refresh token" });

    return success(res, {
      access_token: jwt.sign({ user_id: user.id, type: 'access_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '1h' }),
      refresh_token: jwt.sign({ user_id: user.id, type: 'refresh_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '30d' })
    })
  } catch(e) {}

  return error(res, 400, { message: "invalid refresh token" });
});

router.get("/user/me", isLoggedIn, (req, res) => {
  return success(res, {
    id: req.user?.id,
    name: req.user?.name,
  })
});

router.post("/comment", isLoggedIn, async (req, res) => {
  if (req.user == null) return error(res, 401, 'unauthorized')
  if (!checkProperty(req.body, ["text"]))
    return error(res, 400, { message: "invalid request" });

  const id = req.user.id
  setTimeout(async () => {
    const englishText = await translate(`${req.body.text}`)
    const toneResult = await analyzeTone(englishText)
    const tone = toneResult.document_tone.tones.reduce((a, b) => a.score > b.score ? a : b)
    await prisma.comment.create({
      data: {
        text: `${req.body.text}`,
        type: tone.tone_id,
        userId: id
      }
    })
  },0)

  return success(res, {})
});

router.get("/comments", isLoggedIn, async (req, res) => {
  if (req.user == null) return error(res, 401, 'unauthorized')

  try {
    const comments = await prisma.comment.findMany({
      where: {
        id: { gt: req.user?.lastObtainedId },
        createdAt: { gt: new Date((new Date()).getTime() - 600000) }
      },
    })
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        lastObtainedId: (await prisma.comment.findFirst({orderBy: {id : 'desc'}}))?.id || 0
      },
    })
    return success(res, {comments: comments})
  } catch (e) {
    error(res, 500, {message: "internal server error", error: e})
  }
});

router.post("/translate", isLoggedIn, async (req, res) => {
  if (!checkProperty(req.body, ["text"]))
    return error(res, 400, { message: "invalid request" });

  try {
    const englishText = await translate(`${req.body.text}`)
    return success(res, {text: englishText})
  } catch (e) {
    error(res, 500, {message: "internal server error", error: e})
  }
});

router.post("/analyze/tone", isLoggedIn, async (req, res) => {
  if (!checkProperty(req.body, ["text"]))
    return error(res, 400, { message: "invalid request" });

  try {
    const englishText = await translate(`${req.body.text}`)
    return success(res, {data: await analyzeTone(englishText)})
  } catch (e) {
    error(res, 500, {message: "internal server error", error: e})
  }
});

async function translate(text: string) {
  const params = new URLSearchParams();
  params.append("auth_key", `${process.env.DEEPL_TOKEN}`);
  params.append("text", text);
  params.append("target_lang", "EN");
  const result = await axios.post<URLSearchParams, AxiosResponse<Deepl>>("https://api-free.deepl.com/v2/translate", params);
  return result.data.translations[0].text
}

async function analyzeTone(text: string) {
  const result = await axios.post<{text: string}, AxiosResponse<ToneResult>>(`${process.env.WATSON_TONE_ANALYZER_URL}`, {text: text}, 
  {auth: {
    username: 'apikey',
    password: `${process.env.WATSON_API_KEY}`
  }});
  return result.data
}

function success(res: Response, data: any) {
  res.json(data);
}

function error(res: Response, status: number, error: any) {
  res.status(status);
  res.json(error);
}

export default router;
