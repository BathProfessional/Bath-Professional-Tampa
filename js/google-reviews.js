/* Google Reviews — loads review data and renders carousel */
(function () {
  'use strict';

  const track = document.getElementById('googleReviewTrack');
  const summaryEl = document.getElementById('googleReviewSummary');
  if (!track) return;

  const REVIEWS_DATA = {
    business: 'Bath Professional',
    rating: 5.0,
    reviewCount: 433,
    googleUrl: 'https://share.google/2lFzTu5iHsSYiOprH',
    mapsUrl: 'https://www.google.com/maps/place/Bath+Professional/@27.8128045,-82.6437443,17z',
    writeReviewUrl: 'https://g.page/r/CRrx6UP1Y3zdEBM/review',
    placeId: 'ChIJDeiWOVfhwogROfADvLmt82k',
    reviews: [
      {
        author: 'Shyanne Lowrey',
        rating: 5,
        text: 'Effort and care are clearly put into the work they do. Anyone who works with them will be highly impressed and happy with the results.',
        date: 'May 6, 2026',
        source: 'Google',
        featured: 'Highest rated review',
      },
      {
        author: 'Daniela Valencia',
        rating: 5,
        text: 'I am so happy with the refinishing services that Bath Professional provided. The company was quick to respond to my estimate and schedule me in asap. The employees are super friendly and thorough. I would highly recommend this company.',
        date: 'a month ago',
        source: 'Google',
      },
      {
        author: 'Wilfredo Corchado',
        rating: 5,
        text: "Bath Professional did an amazing job on our tub! Our tub looks brand new. Was in and out in a hard day's work! Highly recommend for any refinishing work.",
        date: 'a month ago',
        source: 'Google',
      },
      {
        author: 'Kaitlyn M',
        rating: 5,
        text: 'You can tell they have been reglazing tubs for a long time and really know what they are doing! I am thrilled with the results! They also gave me a set of instructions afterwards so that the reglazing lasts for a very long time.',
        date: 'a month ago',
        source: 'Google',
      },
      {
        author: 'Lindsey Ogden',
        rating: 5,
        text: 'Fast quality service. Called for a quote and they scheduled quickly to refinish my tub. The transformation is amazing. Our tub went from ugly and worn out to looking brand new!',
        date: '4 months ago',
        source: 'Google',
      },
    ],
  };

  function stars(rating) {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function avatarHue(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
  }

  function renderCard(review) {
    const card = document.createElement('article');
    card.className = 'google-review-card';
    if (review.featured) card.classList.add('google-review-card--featured');
    const hue = avatarHue(review.author);
    card.innerHTML = `
      <div class="google-review-card-top">
        <div class="google-review-avatar" style="--avatar-hue:${hue}" aria-hidden="true">${initials(review.author)}</div>
        <div class="google-review-meta">
          <strong>${review.author}</strong>
          <span class="google-review-date">${review.date}</span>
        </div>
        <img class="google-review-logo" src="images/google-g-logo.svg" alt="" width="18" height="18" loading="lazy" decoding="async">
      </div>
      <div class="google-review-stars" aria-label="${review.rating} out of 5 stars">${stars(review.rating)}</div>
      <blockquote class="google-review-quote">"${review.text}"</blockquote>
      <span class="google-review-source">Verified Google Review</span>
    `;
    return card;
  }

  function renderSummary(data) {
    if (!summaryEl) return;
    summaryEl.innerHTML = `
      <div class="google-summary-rating">
        <img src="images/google-g-logo.svg" alt="Google" width="40" height="40" loading="lazy" decoding="async">
        <div class="google-summary-score-wrap">
          <div class="google-summary-score">${data.rating}<span>/5</span></div>
          <div class="google-summary-stars" aria-label="${data.rating} out of 5 stars">${stars(data.rating)}</div>
        </div>
      </div>
      <div class="google-summary-details">
        <p class="google-summary-count"><strong>${data.reviewCount.toLocaleString()}</strong> verified Google reviews</p>
        <p class="google-summary-tagline">Highest-rated refinishing company in Florida</p>
      </div>
      <div class="google-summary-actions">
        <button type="button" class="btn btn-review-outline">Read All Reviews</button>
        <button type="button" class="btn btn-primary btn-sm">Write a Review</button>
      </div>
    `;
  }

  function duplicateTrack() {
    Array.from(track.children).forEach((card) => {
      track.appendChild(card.cloneNode(true));
    });
  }

  function renderReviews(data) {
    renderSummary(data);
    const reviews = (data.reviews || []).filter((r) => r.rating >= 4);
    track.innerHTML = '';
    reviews.forEach((review) => track.appendChild(renderCard(review)));
    if (reviews.length) duplicateTrack();
  }

  fetch('data/google-reviews.json')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(renderReviews)
    .catch((err) => {
      console.warn('Falling back to embedded Google reviews:', err);
      renderReviews(REVIEWS_DATA);
    });
})();
