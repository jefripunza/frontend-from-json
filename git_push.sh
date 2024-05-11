#!/bin/bash

bracket="============================================="

# Fungsi untuk memutar file suara dengan volume yang disesuaikan
play_sound() {
    local volume="$1"
    local sound_file="$2"
    ffplay -nodisp -loglevel quiet -af "volume=$volume" -autoexit "$sound_file"
}

# Cek apakah ada parameter masuk
if [ $# -eq 0 ]; then
    echo "Usage: $0 <commit_message>"
    play_sound 4 "./sound/error.mp3"
    exit 1
fi

# Memeriksa hasil build untuk kata "error"
build_output=$(yarn tsc | sed '/^yarn run/d; /^$ tsc/d; /^info Visit/d')
if [[ $build_output == *"error"* ]]; then
    echo "$bracket"
    echo "Kode masih ada yang error !!"
    echo ""
    echo "$build_output"
    play_sound 4 "./sound/error.mp3"
    exit 1
fi
echo ""
echo "$bracket"
echo "Kode tidak ada masalah."

play_sound 1 "./sound/start-build.mp3"
yarn build
play_sound 1 "./sound/finish-build.mp3"

git add .
git commit -m "$*"
git push

echo ""
echo "$bracket"
echo "Sukses push"
hide_play_finish=$(play_sound 1 "./sound/finish.mp3")

echo "$bracket" # Exit...
