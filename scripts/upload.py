"""
Use this script to upload an episode mp3 file and generate the Markdown post file

No python library dependencies required! Just python3.

Make sure your mp3 file is named like this: explainercast-NNN.mp3 (3 digits, zero padded, like explainercast-009.mp3)

Usage:

    python3 /path/to/explainercast-NNN.mp3 --force-overwrite

"""
import sys, os, re, uuid, subprocess

from datetime import datetime

SSH_HOST = 'dave@thesmithfam.org'
SSH_SERVER_DIR = '/home/vhosts/thesmithfam.org/podcasts/explainercast'

POST_MARKDOWN_TEMPLATE = \
"""
---
layout: post
title: "Episode {episode_number}: TODO CHANGE THIS TITLE"
date: {episode_date_time}
guid: {episode_guid}
duration: "{episode_duration}"
length: {episode_length_in_bytes}
file: "https://dts.podtrac.com/redirect.mp3/download.explainercast.com/explainercast-{episode_number:03}.mp3"
categories: episode
enable_comments: true
---

{episode_description}
""".strip()

def main():
  mp3_file_path, force_overwrite = check_and_parse_args()
  upload_mp3_file(mp3_file_path=mp3_file_path, force_overwrite=force_overwrite)
  write_post_markdown(mp3_file_path=mp3_file_path, force_overwrite=force_overwrite)


def check_and_parse_args():
  if len(sys.argv) < 2:
    usage(exit_code=1)

  force_overwrite = False
  mp3_file_path = None

  for arg in sys.argv:
    if arg == '--force-overwrite':
      force_overwrite = True
    else:
      mp3_file_path = arg

  if mp3_file_path is None:
    usage(exit_code=2)

  if not os.path.exists(mp3_file_path):
    print(f'File does not exist: {mp3_file_path}')
    sys.exit(3)

  return mp3_file_path, force_overwrite


def upload_mp3_file(mp3_file_path, force_overwrite):
  mp3_basename = os.path.basename(mp3_file_path)
  print(f'Uploading file {mp3_basename} to server...')
  ret = subprocess.run(['ssh', SSH_HOST, '-t', f'ls "{SSH_SERVER_DIR}/{mp3_basename}"'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  if ret.returncode == 0 and force_overwrite == False:
    print(f'File already exists on server: {mp3_basename}')
    print('Use --force-overwrite to overwrite')
    sys.exit(4)

  subprocess.run(['scp', mp3_file_path, f'{SSH_HOST}:{SSH_SERVER_DIR}/.'])


def write_post_markdown(mp3_file_path, force_overwrite):
  print(f'Generating markdown post file for {mp3_file_path}...')
  episode_number = parse_episode_number(mp3_file_path)
  episode_duration = calculate_mp3_duration(mp3_file_path)
  episode_date_time = datetime.now()
  episode_date_string = episode_date_time.strftime('%Y-%m-%d')
  episode_markdown = POST_MARKDOWN_TEMPLATE.format(
    episode_number=episode_number,
    episode_guid=str(uuid.uuid4()),
    episode_duration=episode_duration,
    episode_date_time=f'{episode_date_string} 06:00:00 -0700',
    episode_length_in_bytes=os.path.getsize(mp3_file_path),
    episode_description=f'In episode {episode_number}, Shane and Dave explain TODO CHANGE THIS DESCRIPTION'
  )

  post_base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '_posts'))
  post_file_path = os.path.join(post_base_dir, f'{episode_date_string}-episode-{episode_number}.md')
  if os.path.exists(post_file_path) and force_overwrite == False:
    print(f'Post file already exists: {post_file_path}')
    print('Use --force-overwrite to overwrite')
    sys.exit(5)

  print(f'Writing post file to {post_file_path}...')
  with open(post_file_path, 'w') as f:
    f.write(episode_markdown)


def calculate_mp3_duration(mp3_file_path):
  ret = subprocess.run(['mp3info', '-p', '%m:%02s', mp3_file_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  return ret.stdout.decode('utf8')

def parse_episode_number(mp3_file_path):
  matches = re.search(r'-(\d+)\.mp3', mp3_file_path)
  if matches:
    return int(matches.group(1), base=10)
  else:
    raise ValueError(f'Could not parse episode number from mp3 file name: f{mp3_file_path}')


def usage(exit_code):
  print(f'Usage: python3 {sys.argv[0]} [--force-overwrite] <mp3_file_path>')
  sys.exit(exit_code)

if __name__ == '__main__':
  main()
