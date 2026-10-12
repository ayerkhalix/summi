"use client";
import { Suit } from "./card";
import { Icon } from "./icon";

export function Landing({
  create,
  join,
  tutorial,
  bots,
}: {
  create: () => void;
  join: () => void;
  tutorial: () => void;
  bots: () => void;
}) {
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow">
            <span className="tiny-star">✳</span> YOUR NEXT GREAT GAME NIGHT
          </div>
          <h1>
            Read the table.
            <br />
            Trust your gut.
            <br />
            <em>Get closer.</em>
          </h1>
          <p className="hero-description">
            One target. One shared deck. A few secrets.
            <br />A strategy card game where every draw changes the odds.
            <br className="desktop-break" /> Bring your friends. Play your
            numbers.
          </p>
          <div className="hero-buttons">
            <button className="button primary" onClick={create}>
              Create a room
              <Icon name="arrow" />
            </button>
            <button className="button secondary" onClick={join}>
              Join with a code
              <Icon name="join" />
            </button>
          </div>
          <div className="practice-buttons">
            <button className="button secondary" onClick={bots}>
              Play with bots <Icon name="users" />
            </button>
          </div>
          <div className="hero-meta">
            <span>
              <Icon name="users" size={16} /> Play with bots or 2–5 friends
            </span>
            <span className="meta-dot" />
            <span>No accounts. Just play.</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="floating-card hero-card-one" data-scene-anchor="0" />
          <div className="floating-card hero-card-two" data-scene-anchor="1" />
          <div
            className="floating-card hero-card-three"
            data-scene-anchor="2"
          />
          <div className="floating-card hero-card-four" data-scene-anchor="3" />
          <div className="floating-card hero-card-five" data-scene-anchor="4" />
          <div className="floating-card hero-card-six" data-scene-anchor="5" />
        </div>
      </section>
      <section className="intro-strip">
        <div className="intro-caption">
          <span className="eyebrow">
            SIMPLE TO LEARN.
            <br />
            HARD TO READ.
          </span>
          <button className="text-button" onClick={tutorial}>
            Take a practice seat
            <Icon name="arrow" size={17} />
          </button>
        </div>
        <div className="principle">
          <span className="principle-number">01</span>
          <div>
            <h2>Pick your possibilities.</h2>
            <p>
              See the target. Read the burns.
              <br />
              Choose how many cards to take.
            </p>
          </div>
        </div>
        <div className="principle">
          <span className="principle-number">02</span>
          <div>
            <h2>Watch the story unfold.</h2>
            <p>
              Cards turn. Information changes.
              <br />
              Know when to draw. Or walk away.
            </p>
          </div>
        </div>
        <div className="principle">
          <span className="principle-number">03</span>
          <div>
            <h2>Make every number count.</h2>
            <p>
              Above or below, closest wins.
              <br />
              The final reveal settles everything.
            </p>
          </div>
        </div>
      </section>
      <section className="landing-note">
        <div>
          <span className="mini-cards">
            <Suit suit="spades" />
            <Suit suit="diamonds" />
            <Suit suit="clubs" />
            <Suit suit="hearts" />
          </span>
          <span>
            Familiar cards.
            <br />
            <strong>A different kind of tension.</strong>
          </span>
        </div>
        <p>
          No bets. No buy-ins. Just good decisions
          <br />
          and the people you like beating.
        </p>
        <button
          className="circle-link"
          aria-label="Open guided tutorial"
          onClick={tutorial}
        >
          <Icon name="arrow" size={24} />
        </button>
      </section>
    </main>
  );
}
