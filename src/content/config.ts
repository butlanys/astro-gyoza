import { z, defineCollection } from 'astro:content'

const postsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    lastMod: z.date().optional(),
    summary: z.string().optional(),
    cover: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    comments: z.boolean().default(true),
    draft: z.boolean().default(false),
    sticky: z.number().default(0),
  }),
})

const projectsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string(),
    link: z.string().url(),
    hidden: z.boolean().default(false),
  }),
})

const specCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    comments: z.boolean().default(true),
  }),
})

const friendsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    avatar: z.string(),
    link: z.string().url(),
  }),
})

const travelCollection = defineCollection({
  type: 'data',
  schema: z.object({
    points: z.array(
      z.object({
        id: z.string(),
        year: z.number().int(),
        country: z.string(),
        city: z.string(),
        lat: z.number(),
        lng: z.number(),
        anchor: z.string(),
        summary: z.string(),
        note: z.string().optional(),
        cover: z.string().optional(),
        detailTitle: z.string().optional(),
        detailText: z.string().optional(),
        photos: z
          .array(
            z.object({
              src: z.string(),
              alt: z.string().optional(),
            }),
          )
          .optional(),
        region: z.string().optional(),
      }),
    ),
  }),
})

export const collections = {
  posts: postsCollection,
  projects: projectsCollection,
  spec: specCollection,
  friends: friendsCollection,
  travel: travelCollection,
}
