import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import readingTime from 'reading-time';
import { bundleMDX } from 'mdx-bundler';
// import renderToString from 'next-mdx-remote/render-to-string';
// import MDXComponents from '@theme/components/MDX/MDXComponents';
import { FrontMatterPostType, PostByType, PostType } from 'types/post';
import { remarkSectionize } from './remark-sectionize-fork';
import { remarkFigure } from './remark-figure';

if (process.platform === 'win32') {
  process.env.ESBUILD_BINARY_PATH = path.join(
    process.cwd(),
    'node_modules',
    'esbuild',
    'esbuild.exe'
  );
} else {
  process.env.ESBUILD_BINARY_PATH = path.join(
    process.cwd(),
    'node_modules',
    'esbuild',
    'bin',
    'esbuild'
  );
}

const typeToPath = {
  [PostType.BLOGPOST]: 'content',
  [PostType.SNIPPET]: 'snippets',
};

const root = process.cwd();

export const getFiles = async (type: PostType) => {
  return fs.readdirSync(path.join(root, typeToPath[type]));
};

// Regex to find all the custom static tweets in a MDX file
const TWEET_RE = /<StaticTweet\sid="[0-9]+"\s\/>/g;

export const getFileBySlug = async <T extends PostType>(
  type: T,
  slug: string
): Promise<FrontMatterPostType<T>> => {
  const source = fs.readFileSync(
    path.join(root, typeToPath[type], `${slug}.mdx`),
    'utf8'
  );

  const ScrollSpyWidget = fs
    .readFileSync(
      path.join(
        root,
        'core/components/MDX/custom/Widgets',
        'ScrollSpyWidget.tsx'
      ),
      'utf8'
    )
    .trim();

  const ThemeContext = fs.readFileSync(
    path.join(root, 'core/context', 'ThemeContext.tsx'),
    'utf8'
  );

  // console.log(ScrollSpyWidget);

  const resultMDX = await bundleMDX(source, {
    files: {
      './ScrollSpyWidget.tsx': ScrollSpyWidget,
      './ThemeContext.tsx': ThemeContext,
    },
    xdmOptions(_, options) {
      options.remarkPlugins = [
        ...(options.remarkPlugins ?? []),
        require('remark-slug'),
        require('remark-autolink-headings'),
        remarkSectionize,
        remarkFigure,
      ];

      options.rehypePlugins = [];

      return options;
    },
  });

  // const mdxSourceOld = await renderToString(content, {
  //   components: MDXComponents,
  //   mdxOptions: {
  //     remarkPlugins: [
  //       require('remark-slug'),
  //       require('remark-autolink-headings'),
  //       remarkSectionize,
  //       remarkFigure,
  //     ],
  //   },
  // });

  if (type === PostType.BLOGPOST) {
    // TODO: maybe we want to extract this in its own lib?
    /**
     * Find all occurrence of <StaticTweet id="NUMERIC_TWEET_ID"/>
     * in the content of the MDX blog post
     */
    const tweetMatch = source.match(TWEET_RE);

    /**
     * For all occurrences / matches, extract the id portion of the
     * string, i.e. anything matching the regex /[0-9]+/g
     *
     * tweetIDs then becomes an array of string where each string is
     * the id of a tweet.
     * These IDs are then passed to the getTweets function to be fetched from
     * the Twitter API.
     */
    const tweetIDs = tweetMatch?.map((mdxTweet) => {
      const id = mdxTweet.match(/[0-9]+/g)![0];
      return id;
    });

    const result = {
      mdxSource: resultMDX.code,
      tweetIDs: tweetIDs || [],
      frontMatter: {
        readingTime: readingTime(source),
        ...resultMDX.frontmatter,
      },
    };

    return (result as unknown) as FrontMatterPostType<T>;
  }

  return {
    mdxSource: resultMDX.code,
    frontMatter: resultMDX.frontmatter,
  } as FrontMatterPostType<T>;
};

export const getAllFilesFrontMatter = async <T extends PostType>(
  type: T
): Promise<Array<PostByType<T>>> => {
  const files = fs.readdirSync(path.join(root, typeToPath[type]));

  const posts = files
    .map((postSlug: string) => {
      const source = fs.readFileSync(
        path.join(root, typeToPath[type], postSlug),
        'utf8'
      );
      const parsedFile = matter(source);

      return parsedFile.data as PostByType<T>;
    })
    .sort((post1, post2) => (post1.date > post2.date ? -1 : 1));

  return posts;
};
