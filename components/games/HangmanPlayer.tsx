"use client";

import { useEffect, useState } from "react";
import { playVictoryFanfare } from "@/lib/soundEffects";
import type { HangmanData } from "@/lib/types";

const MAX_WRONG = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function HangmanFigure({ wrong }: { wrong: number }) {
  return (
    <svg className="hangman-figure" width="140" height="160" viewBox="0 0 140 160">
      <line x1="10" y1="150" x2="110" y2="150" stroke="var(--ink)" strokeWidth="4" />
      <line x1="30" y1="150" x2="30" y2="10" stroke="var(--ink)" strokeWidth="4" />
      <line x1="30" y1="10" x2="90" y2="10" stroke="var(--ink)" strokeWidth="4" />
      <line x1="90" y1="10" x2="90" y2="30" stroke="var(--ink)" strokeWidth="4" />
      {wrong > 0 && (
        <circle cx="90" cy="45" r="15" stroke="var(--danger)" strokeWidth="3" fill="none" style={{ animation: "fadeIn 0.3s ease" }} />
      )}
      {wrong > 1 && <line x1="90" y1="60" x2="90" y2="100" stroke="var(--danger)" strokeWidth="3" style={{ animation: "fadeIn 0.3s ease" }} />}
      {wrong > 2 && <line x1="90" y1="70" x2="70" y2="90" stroke="var(--danger)" strokeWidth="3" style={{ animation: "fadeIn 0.3s ease" }} />}
      {wrong > 3 && <line x1="90" y1="70" x2="110" y2="90" stroke="var(--danger)" strokeWidth="3" style={{ animation: "fadeIn 0.3s ease" }} />}
      {wrong > 4 && <line x1="90" y1="100" x2="72" y2="130" stroke="var(--danger)" strokeWidth="3" style={{ animation: "fadeIn 0.3s ease" }} />}
      {wrong > 5 && <line x1="90" y1="100" x2="108" y2="130" stroke="var(--danger)" strokeWidth="3" style={{ animation: "fadeIn 0.3s ease" }} />}
    </svg>
  );
}

export default function HangmanPlayer({ data }: { data: HangmanData }) {
  const [index, setIndex] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [wonWord, setWonWord] = useState(false);

  const current = data.words[index];
  const word = current?.word.toUpperCase() ?? "";
  const wrong = [...guessed].filter((l) => !word.includes(l)).length;
  const solved = word.length > 0 && [...word].every((l) => guessed.has(l));
  const lost = wrong >= MAX_WRONG && !solved;

  useEffect(() => {
    if (solved && !wonWord) {
      setWonWord(true);
      void playVictoryFanfare();
    }
  }, [solved, wonWord]);

  function guess(letter: string) {
    if (guessed.has(letter) || solved || lost) return;
    setGuessed((prev) => new Set(prev).add(letter));
  }

  function nextWord() {
    setIndex((i) => (i + 1) % data.words.length);
    setGuessed(new Set());
    setWonWord(false);
  }

  if (!current) {
    return <div className="game-play-banner">No words in this game yet — add some in the editor.</div>;
  }

  return (
    <>
      <div className="game-play-score">
        🎯 Guesses left: <span key={wrong} className="pop-in">{MAX_WRONG - wrong}</span>
      </div>
      {current.hint && (
        <div style={{ textAlign: "center", color: "var(--ink-soft)", marginBottom: 12 }}>Hint: {current.hint}</div>
      )}
      <HangmanFigure wrong={wrong} />
      <div className="hangman-word">
        {[...word].map((letter, i) => {
          const revealed = guessed.has(letter) || lost;
          return (
            <span key={i} className="hangman-letter-slot">
              {revealed ? (
                <span key={letter} className="pop-in">
                  {letter}
                </span>
              ) : (
                " "
              )}
            </span>
          );
        })}
      </div>

      {solved && <div className="game-play-banner">🎉 Solved it!</div>}
      {lost && <div className="game-play-banner">😵 Out of guesses — the word was {word}</div>}

      {solved || lost ? (
        <div style={{ textAlign: "center" }}>
          <button type="button" className="btn btn-primary" onClick={nextWord}>
            Next word →
          </button>
        </div>
      ) : (
        <div className="hangman-keyboard">
          {ALPHABET.map((letter) => {
            const used = guessed.has(letter);
            const isCorrect = used && word.includes(letter);
            return (
              <button
                key={letter}
                type="button"
                disabled={used}
                className={`hangman-key${used ? (isCorrect ? " hangman-key-correct" : " hangman-key-wrong") : ""}`}
                onClick={() => guess(letter)}
              >
                {letter}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
